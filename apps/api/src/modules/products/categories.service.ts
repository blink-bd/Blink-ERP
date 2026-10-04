import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>
  ) {}

  async findAll(tenantId: string): Promise<Category[]> {
    return this.categoriesRepository.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!category) throw new NotFoundException('الفئة غير موجودة');
    return category;
  }

  async create(tenantId: string, data: Partial<Category>, userId?: string): Promise<Category> {
    const category = this.categoriesRepository.create({
      ...stripProtected(data),
      tenantId,
      createdBy: userId,
    });
    return this.categoriesRepository.save(category);
  }

  async update(tenantId: string, id: string, data: Partial<Category>): Promise<Category> {
    const category = await this.findById(tenantId, id);
    Object.assign(category, stripProtected(data));
    return this.categoriesRepository.save(category);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const category = await this.findById(tenantId, id);
    await this.categoriesRepository.softRemove(category);
  }
}
