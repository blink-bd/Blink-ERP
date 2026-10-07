import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';
import { assertTenantUsable } from '@/common/utils/tenant-access';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not active');
    }

    assertTenantUsable(user.tenant);
    if (payload.tenantId !== user.tenantId || payload.sessionVersion !== user.sessionVersion) {
      throw new UnauthorizedException('جلسة غير صالحة أو منتهية');
    }

    // Rebuild authorization data from the database on every request. This
    // prevents a role removal from remaining effective until the JWT expires.
    const roles = (user.roles || []).map((role) => role.name);
    const permissions = Array.from(
      new Set((user.roles || []).flatMap((role) => (role.permissions || []).map((p) => p.name)))
    );

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles,
      permissions,
    };
  }
}
