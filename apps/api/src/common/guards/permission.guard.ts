import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Enforces permissions on the server. UI visibility is never treated as
 * authorization: every protected write endpoint must use this guard.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest();
    const permissions = new Set<string>(request.user?.permissions || []);

    const hasPermission = required.some((permission) => permissions.has(permission));
    if (!hasPermission) {
      throw new ForbiddenException('ليس لديك صلاحية لتنفيذ هذه العملية');
    }

    return true;
  }
}
