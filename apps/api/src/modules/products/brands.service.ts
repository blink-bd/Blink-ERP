import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Brand } from './entities/brand.entity';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepository: Repository<Brand>
  ) {}

  async findAll(tenantId: string): Promise<Brand[]> {
    return this.brandsRepository.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { name: 'ASC' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Brand> {
    const brand = await this.brandsRepository.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!brand) throw new NotFoundException('العلامة التجارية غير موجودة');
    return brand;
  }

  async create(tenantId: string, data: Partial<Brand>, userId?: string): Promise<Brand> {
    const existing = await this.brandsRepository.findOne({ where: { tenantId, name: data.name } });
    if (existing) throw new ConflictException('العلامة التجارية موجودة مسبقاً');
    const brand = this.brandsRepository.create({
      ...stripProtected(data),
      tenantId,
      createdBy: userId,
    });
    return this.brandsRepository.save(brand);
  }

  async update(tenantId: string, id: string, data: Partial<Brand>): Promise<Brand> {
    const brand = await this.findById(tenantId, id);
    Object.assign(brand, stripProtected(data));
    return this.brandsRepository.save(brand);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const brand = await this.findById(tenantId, id);
    await this.brandsRepository.softRemove(brand);
  }
}
