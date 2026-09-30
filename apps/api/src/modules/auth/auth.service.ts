import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';
import { LoginDto } from './dto/login.dto';
import { assertTenantUsable } from '@/common/utils/tenant-access';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  /**
   * NOTE: this basic implementation authenticates a user by email within a
   * single-tenant lookup once the tenant is known (e.g. subdomain or a
   * tenant-scoped login form). For a fully generic "any tenant" login screen,
   * extend findByEmailAndTenant to search across tenants by email uniqueness
   * rules appropriate to your product.
   */
  async login(dto: LoginDto, tenantId: string, ip: string) {
    const user = await this.usersService.findByEmailAndTenant(dto.email, tenantId);

    if (!user) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (await this.usersService.isLocked(user)) {
      throw new ForbiddenException('الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة متكررة');
    }

    const validPassword = await this.usersService.verifyPassword(user, dto.password);
    if (!validPassword) {
      await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    assertTenantUsable(user.tenant);

    await this.usersService.recordSuccessfulLogin(user.id, ip);

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
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION') || '7d',
    });

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

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
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
}
