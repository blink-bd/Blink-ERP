import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';

@Injectable()
export class WarehousesService {
  constructor(@InjectRepository(Warehouse) private readonly repo: Repository<Warehouse>) {}

  findAll(tenantId: string) {
    return this.repo.find({ where: { tenantId, deletedAt: IsNull() } });
  }

  async findById(tenantId: string, id: string): Promise<Warehouse> {
    const warehouse = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!warehouse) throw new NotFoundException('المخزن غير موجود');
    return warehouse;
  }

  async findOrCreateDefault(tenantId: string, userId?: string): Promise<Warehouse> {
    const existing = await this.repo.findOne({
      where: { tenantId, isMain: true, deletedAt: IsNull() },
    });
    if (existing) return existing;
    const warehouse = this.repo.create({
      tenantId,
      name: 'المخزن الرئيسي',
      code: 'MAIN',
      isMain: true,
      createdBy: userId,
    });
    return this.repo.save(warehouse);
  }

  async create(tenantId: string, data: Partial<Warehouse>, userId?: string) {
    const clean = stripProtected(data);
    await this.assertBranchReference(tenantId, clean.branchId);
    const warehouse = this.repo.create({ ...clean, tenantId, createdBy: userId });
    return this.repo.save(warehouse);
  }

  async update(tenantId: string, id: string, data: Partial<Warehouse>) {
    const warehouse = await this.findById(tenantId, id);
    const clean = stripProtected(data);
    await this.assertBranchReference(tenantId, clean.branchId);
    Object.assign(warehouse, clean);
    return this.repo.save(warehouse);
  }

  private async assertBranchReference(tenantId: string, branchId?: string | null) {
    if (!branchId) return;
    const [branch] = await this.repo.manager.query(
      `SELECT id FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [branchId, tenantId]
    );
    if (!branch) throw new NotFoundException('الفرع غير موجود لهذا التاجر');
  }
}
