import { AccessScopeService } from './access-scope.service';
import { branchForWarehouseWrite, resolveBranchForWrite } from '@/common/utils/access-scope';

describe('AccessScopeService.compute', () => {
  const service = new AccessScopeService({} as any, {} as any);

  const branches = [
    { id: 'b-main', isMain: true },
    { id: 'b-2', isMain: false },
    { id: 'b-3', isMain: false },
  ];
  const warehouses = [
    { id: 'w-shared', branchId: undefined }, // مخزن مشترك
    { id: 'w-main', branchId: 'b-main' },
    { id: 'w-2', branchId: 'b-2' },
    { id: 'w-3', branchId: 'b-3' },
  ];

  const owner = {
    tenantId: 't',
    roles: [{ name: 'owner' }],
    accessAllBranches: false, // المالك دايماً «الكل» حتى لو العمود اتغير
    allowedBranchIds: [],
    allowedWarehouseIds: [],
    activeBranchId: null,
    activeWarehouseId: null,
  };

  it('owner with no selection sees everything', () => {
    const scope = service.compute(owner, branches, warehouses);
    expect(scope.accessAll).toBe(true);
    expect(scope.branchIds).toBeNull();
    expect(scope.warehouseIds).toBeNull();
    expect(scope.mainBranchId).toBe('b-main');
  });

  it('owner working on a branch sees its warehouses + shared ones', () => {
    const scope = service.compute({ ...owner, activeBranchId: 'b-2' }, branches, warehouses);
    expect(scope.branchIds).toEqual(['b-2']);
    expect(scope.warehouseIds).toEqual(['w-shared', 'w-2']);
  });

  it('owner working on a single warehouse', () => {
    const scope = service.compute(
      { ...owner, activeBranchId: 'b-2', activeWarehouseId: 'w-2' },
      branches,
      warehouses
    );
    expect(scope.warehouseIds).toEqual(['w-2']);
  });

  it('ignores an active warehouse that belongs to another branch', () => {
    const scope = service.compute(
      { ...owner, activeBranchId: 'b-2', activeWarehouseId: 'w-3' },
      branches,
      warehouses
    );
    expect(scope.activeWarehouseId).toBeNull();
    expect(scope.warehouseIds).toEqual(['w-shared', 'w-2']);
  });

  it('ignores a deleted active branch', () => {
    const scope = service.compute({ ...owner, activeBranchId: 'gone' }, branches, warehouses);
    expect(scope.activeBranchId).toBeNull();
    expect(scope.branchIds).toBeNull();
  });

  const cashier = {
    tenantId: 't',
    roles: [{ name: 'cashier' }],
    accessAllBranches: false,
    allowedBranchIds: ['b-2'],
    allowedWarehouseIds: ['w-2', 'w-shared'],
    activeBranchId: null,
    activeWarehouseId: null,
  };

  it('restricted user only sees allowed branches/warehouses', () => {
    const scope = service.compute(cashier, branches, warehouses);
    expect(scope.accessAll).toBe(false);
    expect(scope.branchIds).toEqual(['b-2']);
    expect(scope.warehouseIds).toEqual(['w-2', 'w-shared']);
  });

  it('restricted user cannot activate a branch they do not have', () => {
    const scope = service.compute({ ...cashier, activeBranchId: 'b-3' }, branches, warehouses);
    expect(scope.activeBranchId).toBeNull();
    expect(scope.branchIds).toEqual(['b-2']);
  });

  it('restricted user cannot activate a warehouse they do not have', () => {
    const scope = service.compute({ ...cashier, activeWarehouseId: 'w-3' }, branches, warehouses);
    expect(scope.activeWarehouseId).toBeNull();
  });

  it('drops stale ids from the allowed lists', () => {
    const scope = service.compute(
      { ...cashier, allowedBranchIds: ['b-2', 'deleted'], allowedWarehouseIds: ['x'] },
      branches,
      warehouses
    );
    expect(scope.allowedBranchIds).toEqual(['b-2']);
    expect(scope.allowedWarehouseIds).toEqual([]);
    expect(scope.warehouseIds).toEqual([]);
  });

  it('accessAllBranches user (not owner) sees everything but is not owner', () => {
    const scope = service.compute({ ...cashier, accessAllBranches: true }, branches, warehouses);
    expect(scope.isOwner).toBe(false);
    expect(scope.branchIds).toBeNull();
  });

  it('drops allowed warehouses that belong to a branch the user cannot access', () => {
    const scope = service.compute(
      { ...cashier, allowedWarehouseIds: ['w-2', 'w-3'] },
      branches,
      warehouses
    );
    expect(scope.allowedWarehouseIds).toEqual(['w-2']);
  });

  describe('resolveBranchForWrite', () => {
    it('records the operation on the branch of the warehouse used', () => {
      const scope = service.compute({ ...owner, activeBranchId: 'b-3' }, branches, warehouses);
      expect(resolveBranchForWrite(scope, 'b-2')).toBe('b-2');
    });
    it('without a warehouse: active branch, then default branch, then main', () => {
      const all = service.compute(owner, branches, warehouses);
      expect(resolveBranchForWrite(all, undefined)).toBe('b-main');
      expect(resolveBranchForWrite(all, undefined, 'b-3')).toBe('b-3');
      const active = service.compute({ ...owner, activeBranchId: 'b-2' }, branches, warehouses);
      expect(resolveBranchForWrite(active, undefined, 'b-3')).toBe('b-2');
    });
    it('uses the only allowed branch for restricted users', () => {
      const scope = service.compute(cashier, branches, warehouses);
      expect(resolveBranchForWrite(scope, undefined)).toBe('b-2');
      expect(resolveBranchForWrite(scope, 'b-3', 'b-3')).toBe('b-2');
    });
  });

  describe('shared warehouses (one warehouse used by more than one branch)', () => {
    const withShared = [
      { id: 'w-main', branchId: 'b-main', sharedBranchIds: ['b-3'] },
      { id: 'w-2', branchId: 'b-2', sharedBranchIds: [] },
    ];

    it('shows the shared warehouse with every branch that uses it', () => {
      const b3 = service.compute({ ...owner, activeBranchId: 'b-3' }, branches, withShared);
      expect(b3.warehouseIds).toEqual(['w-main']);
      const main = service.compute({ ...owner, activeBranchId: 'b-main' }, branches, withShared);
      expect(main.warehouseIds).toEqual(['w-main']);
      const b2 = service.compute({ ...owner, activeBranchId: 'b-2' }, branches, withShared);
      expect(b2.warehouseIds).toEqual(['w-2']);
    });

    it('accepts the shared warehouse as the active warehouse of the other branch', () => {
      const scope = service.compute(
        { ...owner, activeBranchId: 'b-3', activeWarehouseId: 'w-main' },
        branches,
        withShared
      );
      expect(scope.activeWarehouseId).toBe('w-main');
    });

    it('lets a user restricted to the sharing branch keep the shared warehouse', () => {
      const scope = service.compute(
        {
          ...owner,
          roles: [{ name: 'cashier' }],
          accessAllBranches: false,
          allowedBranchIds: ['b-3'],
          allowedWarehouseIds: ['w-main', 'w-2'],
        },
        branches,
        withShared
      );
      expect(scope.allowedWarehouseIds).toEqual(['w-main']);
    });

    it('records a sale on the working branch when it uses the warehouse, else on its owner', () => {
      const w = withShared[0];
      expect(branchForWarehouseWrite(w, 'b-3')).toBe('b-3');
      expect(branchForWarehouseWrite(w, 'b-main')).toBe('b-main');
      expect(branchForWarehouseWrite(w, 'b-2')).toBe('b-main');
      expect(branchForWarehouseWrite(w, null)).toBe('b-main');
      expect(branchForWarehouseWrite({ branchId: null }, 'b-2')).toBe('b-2');
    });
  });
});
