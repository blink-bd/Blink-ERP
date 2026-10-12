import { NotFoundException } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { FeaturesService } from '@/modules/features/features.service';

describe('WarehousesService branch ownership', () => {
  const buildService = () => {
    const repository: any = {
      manager: {
        query: jest.fn(async (sql: string) =>
          sql.includes('COUNT(*)') ? [{ c: 0 }] : [{ maxWarehouses: null, maxBranches: null }]
        ),
      },
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const branches: any = { findOne: jest.fn() };
    const features: any = { tenantHasFeature: jest.fn().mockResolvedValue(true) };
    return {
      service: new WarehousesService(repository, branches, features as FeaturesService),
      repository,
      branches,
      features,
    };
  };

  it('rejects linking a warehouse to a branch outside the active tenant', async () => {
    const { service, repository, branches } = buildService();
    branches.findOne.mockResolvedValue(null);

    await expect(
      service.create('tenant-a', { name: 'مخزن', branchId: 'foreign-branch' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('creates a warehouse using the authenticated tenant, not a body tenant id', async () => {
    const { service, repository, branches } = buildService();
    branches.findOne.mockResolvedValue({ id: 'branch-a', tenantId: 'tenant-a', isActive: true });

    await service.create(
      'tenant-a',
      { name: 'مخزن', branchId: 'branch-a', tenantId: 'tenant-b' } as any,
      'user-a'
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'مخزن',
        branchId: 'branch-a',
        tenantId: 'tenant-a',
        createdBy: 'user-a',
        isMain: true,
        isActive: true,
      })
    );
  });
});


describe('WarehousesService feature gate', () => {
  it('does not let includeAll expose secondary warehouses when the feature is disabled', async () => {
    const main = { id: 'main', isMain: true };
    const secondary = { id: 'secondary', isMain: false };
    const repository: any = { find: jest.fn().mockResolvedValue([main, secondary]) };
    const branches: any = { findOne: jest.fn() };
    const features: any = { tenantHasFeature: jest.fn().mockResolvedValue(false) };
    const service = new WarehousesService(repository, branches, features as FeaturesService);

    await expect(service.findAll('tenant-a', true)).resolves.toEqual([main]);
  });
});
