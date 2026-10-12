import { BadRequestException } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';

describe('WarehousesService branch ownership', () => {
  const buildService = () => {
    const repository: any = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const branches: any = { findOne: jest.fn() };
    return { service: new WarehousesService(repository, branches), repository, branches };
  };

  it('rejects linking a warehouse to a branch outside the active tenant', async () => {
    const { service, repository, branches } = buildService();
    branches.findOne.mockResolvedValue(null);

    await expect(
      service.create('tenant-a', { name: 'مخزن', branchId: 'foreign-branch' })
    ).rejects.toBeInstanceOf(BadRequestException);
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

    expect(repository.create).toHaveBeenCalledWith({
      name: 'مخزن',
      branchId: 'branch-a',
      tenantId: 'tenant-a',
      createdBy: 'user-a',
    });
  });
});
