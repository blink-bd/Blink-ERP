import { stripProtected } from '@/common/utils/sanitize';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse) private readonly repo: Repository<Warehouse>,
    @InjectRepository(Branch) private readonly branches: Repository<Branch>
  ) {}

  findAll(tenantId: string) {
    return this.repo.find({ where: { tenantId, deletedAt: IsNull() } });
  }

  async findById(tenantId: string, id: string): Promise<Warehouse> {
    const warehouse = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!warehouse) throw new NotFoundException('المخزن غير موجود');
    return warehouse;
  }

  async findOrCreateDefault(tenantId: string, userId?: string): Promise<Warehouse> {
    let branch = await this.branches.findOne({
      where: { tenantId, isMain: true, deletedAt: IsNull() },
    });
    if (!branch) {
      branch = await this.branches.save(
        this.branches.create({
          tenantId,
          name: 'الفرع الرئيسي',
          code: `MAIN-${tenantId.slice(0, 8)}`,
          isMain: true,
          isActive: true,
          createdBy: userId,
        })
      );
    }

    const existing = await this.repo.findOne({
      where: { tenantId, isMain: true, deletedAt: IsNull() },
    });
    if (existing) {
      if (!existing.branchId) {
        existing.branchId = branch.id;
        return this.repo.save(existing);
      }
      return existing;
    }
    const warehouse = this.repo.create({
      tenantId,
      branchId: branch.id,
      name: 'المخزن الرئيسي',
      code: 'MAIN',
      isMain: true,
      createdBy: userId,
    });
    return this.repo.save(warehouse);
  }

  async create(tenantId: string, data: Partial<Warehouse>, userId?: string) {
    const safeData = stripProtected(data);
    if (safeData.branchId) await this.assertActiveTenantBranch(tenantId, safeData.branchId);
    const warehouse = this.repo.create({ ...safeData, tenantId, createdBy: userId });
    return this.repo.save(warehouse);
  }

  async update(tenantId: string, id: string, data: Partial<Warehouse>) {
    const warehouse = await this.findById(tenantId, id);
    const safeData = stripProtected(data);
    if (safeData.branchId) await this.assertActiveTenantBranch(tenantId, safeData.branchId);
    Object.assign(warehouse, safeData);
    return this.repo.save(warehouse);
  }

  private async assertActiveTenantBranch(tenantId: string, branchId: string): Promise<void> {
    const branch = await this.branches.findOne({
      where: { id: branchId, tenantId, isActive: true, deletedAt: IsNull() },
    });
    if (!branch) throw new BadRequestException('الفرع المحدد غير موجود أو غير نشط لهذا التاجر');
  }
}
