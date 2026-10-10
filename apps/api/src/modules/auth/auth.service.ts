import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';
import { LoginDto } from './dto/login.dto';
import { assertTenantUsable } from '@/common/utils/tenant-access';
import { assertStrongPassword } from '@/common/utils/password-policy';
import { burnPasswordVerification } from '@/common/security/timing';
import { AuditService } from '@/modules/audit/audit.service';
import { User } from '@/modules/users/entities/user.entity';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService
  ) {}

  /**
   * NOTE: this basic implementation authenticates a user by email within a
   * single-tenant lookup once the tenant is known (e.g. subdomain or a
   * tenant-scoped login form). For a fully generic "any tenant" login screen,
   * extend findByEmailAndTenant to search across tenants by email uniqueness
   * rules appropriate to your product.
   */
  async login(dto: LoginDto, tenantId: string, ip: string, meta: RequestMeta = {}) {
    const user = await this.usersService.findByEmailAndTenant(dto.email, tenantId);
    const base = { tenantId: user?.tenantId, ip, userAgent: meta.userAgent, userEmail: dto.email };

    if (!user) {
      // تحقق وهمي بنفس التكلفة حتى لا يكشف زمن الرد وجود الإيميل
      await burnPasswordVerification(dto.password);
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (await this.usersService.isLocked(user)) {
      await this.audit.log({
        ...base,
        userId: user.id,
        action: 'TENANT_LOGIN_BLOCKED_LOCKED',
        severity: 'warning',
      });
      throw new ForbiddenException('الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة متكررة');
    }

    const validPassword = await this.usersService.verifyPassword(user, dto.password);
    if (!validPassword) {
      const locked = await this.usersService.recordFailedLogin(user.id);
      await this.audit.log({
        ...base,
        userId: user.id,
        action: locked ? 'TENANT_ACCOUNT_LOCKED' : 'TENANT_LOGIN_FAILED',
        severity: 'warning',
      });
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (!user.isActive) {
      throw new ForbiddenException('هذا الحساب موقوف. تواصل مع مدير المتجر');
    }

    assertTenantUsable(user.tenant);

    await this.usersService.recordSuccessfulLogin(user.id, ip);
    await this.audit.log({ ...base, userId: user.id, action: 'TENANT_LOGIN' });

    return this.issueSession(user);
  }

  /** يصدر توكنات جديدة (دخول أو بعد تغيير كلمة المرور). */
  private issueSession(user: User) {
    const roles = (user.roles || []).map((r) => r.name);
    const permissions = Array.from(
      new Set((user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.name)))
    );

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles,
      permissions,
      sessionVersion: user.sessionVersion,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
    });

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        sessionVersion: user.sessionVersion,
        typ: 'refresh',
      },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION') || '7d',
      }
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        roles,
        permissions,
      },
      tenant: {
        id: user.tenant.id,
        businessName: user.tenant.businessName,
        currency: user.tenant.currency,
        timezone: user.tenant.timezone,
        language: user.tenant.defaultLanguage,
      },
      accessToken,
      refreshToken,
    };
  }

  /** تغيير كلمة المرور للمستخدم الحالي: يبطل كل الجلسات الأخرى ويصدر جلسة جديدة. */
  async changeOwnPassword(userId: string, current: string, next: string, meta: RequestMeta = {}) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('المستخدم غير موجود');
    if (!(await this.usersService.verifyPassword(user, current))) {
      await this.audit.log({
        tenantId: user.tenantId,
        userId: user.id,
        userEmail: user.email,
        ip: meta.ip,
        userAgent: meta.userAgent,
        action: 'PASSWORD_CHANGE_FAILED',
        severity: 'warning',
      });
      throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
    }
    if (current === next) throw new ForbiddenException('كلمة المرور الجديدة لازم تختلف عن الحالية');
    assertStrongPassword(next);
    await this.usersService.setPassword(user.id, next);
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      userEmail: user.email,
      ip: meta.ip,
      userAgent: meta.userAgent,
      action: 'PASSWORD_CHANGED',
      severity: 'warning',
    });
    const fresh = await this.usersService.findById(user.id);
    return this.issueSession(fresh as User);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (
        !user ||
        !user.isActive ||
        payload.sessionVersion !== user.sessionVersion ||
        (payload.tenantId && payload.tenantId !== user.tenantId)
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      assertTenantUsable(user.tenant);

      const roles = (user.roles || []).map((r) => r.name);
      const permissions = Array.from(
        new Set((user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.name)))
      );

      const newPayload = {
        sub: user.id,
        tenantId: user.tenantId,
        email: user.email,
        roles,
        permissions,
        sessionVersion: user.sessionVersion,
      };

      const accessToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
      });

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('المستخدم غير موجود');
    await this.usersService.revokeSessions(userId);
  }
}
