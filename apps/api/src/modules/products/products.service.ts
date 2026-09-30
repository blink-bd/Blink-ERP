import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  isActive?: boolean;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>
  ) {}

  async findAll(tenantId: string, options: ListOptions = {}) {
    const page = options.page || 1;
    const limit = options.limit || 20;

    const query = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .where('product.tenantId = :tenantId', { tenantId })
      .andWhere('product.deletedAt IS NULL');

    if (options.search) {
      query.andWhere('(product.name ILIKE :search OR product.sku ILIKE :search OR product.barcode ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }
    if (options.categoryId) {
      query.andWhere('product.categoryId = :categoryId', { categoryId: options.categoryId });
    }
    if (options.brandId) {
      query.andWhere('product.brandId = :brandId', { brandId: options.brandId });
    }
    if (options.isActive !== undefined) {
      query.andWhere('product.isActive = :isActive', { isActive: options.isActive });
    }

    const [data, total] = await query
      .orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findById(tenantId: string, id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['category', 'brand'],
    });
    if (!product) {
      throw new NotFoundException('المنتج غير موجود');
    }
    return product;
  }

  async findByBarcodeOrSku(tenantId: string, code: string): Promise<Product | null> {
    return this.productsRepository
      .createQueryBuilder('product')
      .where('product.tenantId = :tenantId', { tenantId })
      .andWhere('(product.barcode = :code OR product.sku = :code)', { code })
      .andWhere('product.deletedAt IS NULL')
      .getOne();
  }

  async create(tenantId: string, dto: CreateProductDto, userId?: string): Promise<Product> {
    if (dto.sku) {
      const existingSku = await this.productsRepository.findOne({ where: { tenantId, sku: dto.sku } });
      if (existingSku) throw new ConflictException('رمز المنتج موجود مسبقاً');
    }
    if (dto.barcode) {
      const existingBarcode = await this.productsRepository.findOne({ where: { tenantId, barcode: dto.barcode } });
      if (existingBarcode) throw new ConflictException('الباركود موجود مسبقاً');
    }

    const product = this.productsRepository.create({
      ...dto,
      tenantId,
      createdBy: userId,
    });

    return this.productsRepository.save(product);
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto, userId?: string): Promise<Product> {
    const product = await this.findById(tenantId, id);
    Object.assign(product, dto, { updatedBy: userId });
    return this.productsRepository.save(product);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const product = await this.findById(tenantId, id);
    await this.productsRepository.softRemove(product);
  }
}
