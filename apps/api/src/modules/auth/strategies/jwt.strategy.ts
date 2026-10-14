import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';
import { AccessScopeService } from '@/modules/users/access-scope.service';
import { assertTenantUsable } from '@/common/utils/tenant-access';
import { ACCESS_TOKEN_COOKIE } from '@/common/utils/auth-cookies';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  username?: string | null;
  roles: string[];
  permissions: string[];
  sessionVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly accessScope: AccessScopeService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: any) => request?.cookies?.[ACCESS_TOKEN_COOKIE] || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException('User not active');

    assertTenantUsable(user.tenant);
    if (payload.tenantId !== user.tenantId || payload.sessionVersion !== user.sessionVersion) {
      throw new UnauthorizedException('جلسة غير صالحة أو منتهية');
    }

    // Reload roles on every request so revoked permissions take effect immediately.
    const roles = (user.roles || []).map((role) => role.name);
    const permissions = Array.from(
      new Set((user.roles || []).flatMap((role) => (role.permissions || []).map((p) => p.name)))
    );

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      username: user.username ?? null,
      roles,
      permissions,
      authType: 'jwt' as const,
      fullName: user.fullName,
      branchId: user.branchId,
      warehouseId: user.warehouseId,
      // نطاق الفروع/المخازن (الصلاحيات + فرع العمل) — بيتحسب مع كل طلب عشان أي تغيير
      // في صلاحيات المستخدم أو فرع العمل يتطبق فوراً.
      scope: await this.accessScope.resolve(user),
    };
  }
}
