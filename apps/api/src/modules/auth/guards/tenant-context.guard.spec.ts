import { ExecutionContext } from '@nestjs/common';
import { TenantContextGuard } from './tenant-context.guard';

function contextFor(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantContextGuard', () => {
  it('derives tenantId from the authenticated user', () => {
    const request: any = { user: { tenantId: 'tenant-a' }, params: {} };

    expect(new TenantContextGuard().canActivate(contextFor(request))).toBe(true);
    expect(request.tenantId).toBe('tenant-a');
  });

  it('rejects a route tenant that differs from the authenticated tenant', () => {
    const request = { user: { tenantId: 'tenant-a' }, params: { tenantId: 'tenant-b' } };

    expect(() => new TenantContextGuard().canActivate(contextFor(request))).toThrow(
      'Tenant context mismatch'
    );
  });

  it('rejects requests without an authenticated tenant', () => {
    const request = { user: {}, params: {} };

    expect(() => new TenantContextGuard().canActivate(contextFor(request))).toThrow(
      'Tenant context required'
    );
  });
});
