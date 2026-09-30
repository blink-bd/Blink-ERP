import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(@InjectRepository(Supplier) private readonly repo: Repository<Supplier>) {}

  async findAll(tenantId: string, search?: string) {
    const query = this.repo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.deletedAt IS NULL');
    if (search) {
      query.andWhere('(s.name ILIKE :search OR s.phone ILIKE :search)', { search: `%${search}%` });
    }
    return query.orderBy('s.name', 'ASC').getMany();
  }

  async findById(tenantId: string, id: string): Promise<Supplier> {
    const supplier = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    return supplier;
  }

  create(tenantId: string, data: Partial<Supplier>, userId?: string) {
    const supplier = this.repo.create({ ...stripProtected(data), tenantId, createdBy: userId });
    return this.repo.save(supplier);
  }

  async update(tenantId: string, id: string, data: Partial<Supplier>) {
    const supplier = await this.findById(tenantId, id);
    Object.assign(supplier, stripProtected(data));
    return this.repo.save(supplier);
  }

  async adjustBalance(tenantId: string, id: string, delta: number): Promise<Supplier> {
    const supplier = await this.findById(tenantId, id);
    supplier.balance = Number(supplier.balance) + delta;
    return this.repo.save(supplier);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const supplier = await this.findById(tenantId, id);
    await this.repo.softRemove(supplier);
  }
}
