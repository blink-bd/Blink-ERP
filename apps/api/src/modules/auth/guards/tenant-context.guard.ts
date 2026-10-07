import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new UnauthorizedException('Tenant context required');
    }

    if (request.params?.tenantId && request.params.tenantId !== user.tenantId) {
      throw new UnauthorizedException('Tenant context mismatch');
    }

    // The tenant is always derived from the authenticated user, never from a
    // query string or request body.
    request.tenantId = user.tenantId;
    return true;
  }
}
