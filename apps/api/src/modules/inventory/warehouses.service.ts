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

  create(tenantId: string, data: Partial<Warehouse>, userId?: string) {
    const warehouse = this.repo.create({ ...stripProtected(data), tenantId, createdBy: userId });
    return this.repo.save(warehouse);
  }

  async update(tenantId: string, id: string, data: Partial<Warehouse>) {
    const warehouse = await this.findById(tenantId, id);
    Object.assign(warehouse, stripProtected(data));
    return this.repo.save(warehouse);
  }
}
