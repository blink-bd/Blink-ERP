import { ExecutionContext } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';

function contextWithPermissions(permissions: string[]): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  it('allows a user with the required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['products.create']),
    };
    const guard = new PermissionGuard(reflector as any);

    expect(guard.canActivate(contextWithPermissions(['products.create']))).toBe(true);
  });

  it('rejects a user without the required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['products.delete']),
    };
    const guard = new PermissionGuard(reflector as any);

    expect(() => guard.canActivate(contextWithPermissions(['products.view']))).toThrow(
      'ليس لديك صلاحية لتنفيذ هذه العملية'
    );
  });

  it('fails open only when an endpoint declares no permission metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    const guard = new PermissionGuard(reflector as any);

    expect(guard.canActivate(contextWithPermissions([]))).toBe(true);
  });
});
