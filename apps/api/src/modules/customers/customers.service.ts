import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Customer } from './entities/customer.entity';

@Injectable()
export class CustomersService {
  constructor(@InjectRepository(Customer) private readonly repo: Repository<Customer>) {}

  async findAll(tenantId: string, search?: string) {
    const query = this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.deletedAt IS NULL');
    if (search) {
      query.andWhere('(c.name ILIKE :search OR c.phone ILIKE :search)', { search: `%${search}%` });
    }
    return query.orderBy('c.name', 'ASC').getMany();
  }

  async findById(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!customer) throw new NotFoundException('العميل غير موجود');
    return customer;
  }

  create(tenantId: string, data: Partial<Customer>, userId?: string) {
    const customer = this.repo.create({ ...stripProtected(data), tenantId, createdBy: userId });
    return this.repo.save(customer);
  }

  async update(tenantId: string, id: string, data: Partial<Customer>) {
    const customer = await this.findById(tenantId, id);
    Object.assign(customer, stripProtected(data));
    return this.repo.save(customer);
  }

  async adjustBalance(tenantId: string, id: string, delta: number): Promise<Customer> {
    const customer = await this.findById(tenantId, id);
    customer.balance = Number(customer.balance) + delta;
    return this.repo.save(customer);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const customer = await this.findById(tenantId, id);
    await this.repo.softRemove(customer);
  }
}
