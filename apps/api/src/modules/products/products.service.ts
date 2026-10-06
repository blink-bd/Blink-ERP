import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { WarehousesService } from '@/modules/inventory/warehouses.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { FeaturesService } from '@/modules/features/features.service';

const HALF_WHOLESALE_FEATURE_CODE = 'half_wholesale_pricing';

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
    private readonly productsRepository: Repository<Product>,
    private readonly inventoryService: InventoryService,
    private readonly warehousesService: WarehousesService,
    private readonly featuresService: FeaturesService
  ) {}

  private validateSellingPrices(
    costPrice: number,
    sellingPrice: number,
    wholesalePrice?: number,
    halfWholesalePrice?: number
  ) {
    if (sellingPrice <= costPrice) {
      throw new BadRequestException('سعر البيع القطاعي يجب أن يكون أكبر من سعر التكلفة');
    }
    if (halfWholesalePrice !== undefined && halfWholesalePrice !== null && halfWholesalePrice <= costPrice) {
      throw new BadRequestException('سعر البيع نصف الجملة يجب أن يكون أكبر من سعر التكلفة');
    }
    if (wholesalePrice !== undefined && wholesalePrice !== null && wholesalePrice <= costPrice) {
      throw new BadRequestException('سعر البيع بالجملة يجب أن يكون أكبر من سعر التكلفة');
    }
  }

  /**
   * لو التاجر بعت قيمة لسعر نصف الجملة وهو مش مفعّل له الميزة، نرفض الطلب
   * بدل ما نتجاهل القيمة بصمت — عشان محدش يقدر يلتف على التفعيل عن طريق الـ API مباشرة.
   */
  private async assertHalfWholesaleAllowed(tenantId: string, value?: number | null) {
    if (value === undefined || value === null) return;
    const allowed = await this.featuresService.tenantHasFeature(
      tenantId,
      HALF_WHOLESALE_FEATURE_CODE
    );
    if (!allowed) {
      throw new BadRequestException('ميزة تسعير نصف الجملة غير مفعّلة لهذا الحساب');
    }
  }

  private async findDuplicateIdentifiers(
    tenantId: string,
    sku?: string,
    barcode?: string,
    excludeId?: string
  ) {
    const duplicates: { sku?: boolean; barcode?: boolean } = {};
    const query = this.productsRepository
      .createQueryBuilder('product')
      .where('product.tenantId = :tenantId', { tenantId })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('(product.sku = :sku OR product.barcode = :barcode)', {
        sku: sku || '__empty_sku__',
        barcode: barcode || '__empty_barcode__',
      });
    if (excludeId) query.andWhere('product.id <> :excludeId', { excludeId });
    const rows = await query.getMany();
    for (const row of rows) {
      if (sku && row.sku === sku) duplicates.sku = true;
      if (barcode && row.barcode === barcode) duplicates.barcode = true;
    }
    return duplicates;
  }

  async checkIdentifiers(tenantId: string, sku?: string, barcode?: string, excludeId?: string) {
    const duplicates = await this.findDuplicateIdentifiers(
      tenantId,
      sku?.trim(),
      barcode?.trim(),
      excludeId
    );
    return {
      skuAvailable: !duplicates.sku,
      barcodeAvailable: !duplicates.barcode,
      duplicateSku: !!duplicates.sku,
      duplicateBarcode: !!duplicates.barcode,
    };
  }

  /** تحسب رقم التحقق (checksum) لباركود EAN-13 من أول 12 رقم. */
  private computeEan13CheckDigit(digits12: string): number {
    const sum = digits12
      .split('')
      .map(Number)
      .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10;
  }

  /**
   * يولّد باركود EAN-13 رقمي صالح (checksum صحيح) وغير مكرر داخل بيانات هذا
   * التاجر. بادئة 200 من المدى المخصص للاستخدام الداخلي في معيار GS1 (In-Store
   * Use) فمفيش تعارض مع باركودات منتجات حقيقية مسجّلة عالمياً.
   */
  async generateUniqueBarcode(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 30; attempt++) {
      const randomPart = Math.floor(Math.random() * 1_000_000_000)
        .toString()
        .padStart(9, '0');
      const digits12 = `200${randomPart}`;
      const checkDigit = this.computeEan13CheckDigit(digits12);
      const candidate = `${digits12}${checkDigit}`;

      const existing = await this.productsRepository
        .createQueryBuilder('product')
        .where('product.tenantId = :tenantId', { tenantId })
        .andWhere('product.barcode = :candidate', { candidate })
        .getOne();

      if (!existing) return candidate;
    }
    throw new BadRequestException('تعذّر توليد باركود غير مكرر، حاول مرة أخرى');
  }

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
      query.andWhere(
        '(product.name ILIKE :search OR product.sku ILIKE :search OR product.barcode ILIKE :search)',
        {
          search: `%${options.search}%`,
        }
      );
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

    // نجيب إجمالي الكمية المتاحة لكل منتج من كل المخازن في استعلام واحد (أسرع من N استعلامات)
    const ids = data.map((p) => p.id);
    const stockMap = new Map<string, number>();
    if (ids.length) {
      const rows = await this.productsRepository.manager.query(
        `SELECT product_id, COALESCE(SUM(available_quantity), 0) AS qty
         FROM inventory WHERE product_id = ANY($1) GROUP BY product_id`,
        [ids]
      );
      for (const r of rows) stockMap.set(r.product_id, Number(r.qty));
    }

    const openingStockMap = new Map<string, number>();
    if (ids.length) {
      const rows = await this.productsRepository.manager.query(
        `SELECT i.product_id, COALESCE(SUM(i.available_quantity), 0) AS qty
         FROM inventory i
         JOIN warehouses w ON w.id = i.warehouse_id
         WHERE i.product_id = ANY($1) AND w.is_main = true AND w.deleted_at IS NULL
         GROUP BY i.product_id`,
        [ids]
      );
      for (const r of rows) openingStockMap.set(r.product_id, Number(r.qty));
    }

    const withStock = data.map((p) => {
      const availableQuantity = p.trackInventory ? stockMap.get(p.id) || 0 : null;
      const openingQuantity = p.trackInventory ? openingStockMap.get(p.id) || 0 : null;
      let stockStatus: 'available' | 'low_stock' | 'out_of_stock' | 'not_tracked' = 'not_tracked';
      if (p.trackInventory) {
        if ((availableQuantity || 0) <= 0) stockStatus = 'out_of_stock';
        else if ((availableQuantity || 0) <= p.minStockLevel) stockStatus = 'low_stock';
        else stockStatus = 'available';
      }
      return { ...p, availableQuantity, openingQuantity, stockStatus };
    });

    return {
      data: withStock,
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
    const sku = dto.sku?.trim() || undefined;
    const barcode = dto.barcode?.trim() || undefined;
    const duplicates = await this.findDuplicateIdentifiers(tenantId, sku, barcode);
    if (duplicates.sku && duplicates.barcode)
      throw new ConflictException('رمز المنتج والباركود موجودان مسبقاً');
    if (duplicates.sku) throw new ConflictException('رمز المنتج موجود مسبقاً');
    if (duplicates.barcode) throw new ConflictException('الباركود موجود مسبقاً');

    await this.assertHalfWholesaleAllowed(tenantId, dto.halfWholesalePrice);
    this.validateSellingPrices(
      Number(dto.costPrice),
      Number(dto.sellingPrice),
      dto.wholesalePrice,
      dto.halfWholesalePrice
    );

    const initialQuantity = dto.initialQuantity;
    const warehouseId = dto.warehouseId;
    const productData = { ...dto } as any;
    delete productData.initialQuantity;
    delete productData.warehouseId;
    delete productData.confirmOpeningQuantityChange;
    delete productData.openingQuantityReason;
    delete productData.confirmPriceReview;

    const product = this.productsRepository.create({
      ...productData,
      sku,
      barcode,
      tenantId,
      createdBy: userId,
    } as Partial<Product>);

    const saved = await this.productsRepository.save(product);

    // كمية افتتاحية (اختياري) — بتتسجل كحركة مخزون من نوع opening_balance
    if (initialQuantity && initialQuantity > 0) {
      const wh = warehouseId
        ? await this.warehousesService.findById(tenantId, warehouseId)
        : await this.warehousesService.findOrCreateDefault(tenantId, userId);
      await this.inventoryService.adjustInventory({
        tenantId,
        productId: saved.id,
        warehouseId: wh.id,
        quantity: initialQuantity,
        unitCost: Number(saved.costPrice),
        type: 'opening_balance',
        notes: 'رصيد افتتاحي عند إنشاء المنتج',
        userId,
      });
    }

    return saved;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
    userId?: string
  ): Promise<Product> {
    const product = await this.findById(tenantId, id);
    const sku = dto.sku === undefined ? product.sku : dto.sku?.trim() || undefined;
    const barcode = dto.barcode === undefined ? product.barcode : dto.barcode?.trim() || undefined;
    const duplicates = await this.findDuplicateIdentifiers(tenantId, sku, barcode, id);
    if (duplicates.sku && duplicates.barcode)
      throw new ConflictException('رمز المنتج والباركود موجودان مسبقاً');
    if (duplicates.sku) throw new ConflictException('رمز المنتج موجود مسبقاً');
    if (duplicates.barcode) throw new ConflictException('الباركود موجود مسبقاً');

    const costPrice =
      dto.costPrice === undefined ? Number(product.costPrice) : Number(dto.costPrice);
    const sellingPrice =
      dto.sellingPrice === undefined ? Number(product.sellingPrice) : Number(dto.sellingPrice);
    const wholesalePrice =
      dto.wholesalePrice === undefined
        ? product.wholesalePrice === null || product.wholesalePrice === undefined
          ? undefined
          : Number(product.wholesalePrice)
        : dto.wholesalePrice;
    const halfWholesalePrice =
      dto.halfWholesalePrice === undefined
        ? product.halfWholesalePrice === null || product.halfWholesalePrice === undefined
          ? undefined
          : Number(product.halfWholesalePrice)
        : dto.halfWholesalePrice;
    await this.assertHalfWholesaleAllowed(tenantId, dto.halfWholesalePrice);
    const isSystemCostReviewUpdate =
      (dto as any).needsPriceReview === true &&
      dto.sellingPrice === undefined &&
      dto.wholesalePrice === undefined &&
      dto.halfWholesalePrice === undefined;
    if (!isSystemCostReviewUpdate) {
      this.validateSellingPrices(costPrice, sellingPrice, wholesalePrice, halfWholesalePrice);
    }

    const {
      initialQuantity,
      warehouseId,
      confirmOpeningQuantityChange,
      openingQuantityReason,
      confirmPriceReview,
      ...productData
    } = dto as any;
    Object.assign(product, productData, { sku, barcode, updatedBy: userId });

    if (
      initialQuantity !== undefined &&
      initialQuantity !== null &&
      !Number.isNaN(Number(initialQuantity))
    ) {
      const nextQuantity = Number(initialQuantity);
      if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
        throw new BadRequestException('الكمية الافتتاحية يجب أن تكون صفراً أو أكبر');
      }
      const warehouse = warehouseId
        ? await this.warehousesService.findById(tenantId, warehouseId)
        : await this.warehousesService.findOrCreateDefault(tenantId, userId);
      const current = await this.inventoryService.getAvailableQuantity(
        tenantId,
        product.id,
        warehouse.id
      );
      if (Math.abs(nextQuantity - current) > 0.0001) {
        if (!confirmOpeningQuantityChange) {
          throw new BadRequestException('تغيير الكمية الافتتاحية يحتاج إلى تأكيد');
        }
        if (!openingQuantityReason?.trim()) {
          throw new BadRequestException('اكتب سبب تعديل الكمية الافتتاحية');
        }
        await this.inventoryService.adjustInventory({
          tenantId,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: nextQuantity - current,
          unitCost: Number(product.costPrice),
          type: 'adjustment',
          notes: `تعديل الكمية الافتتاحية: ${openingQuantityReason.trim()}`,
          userId,
        });
      }
    }

    if (confirmPriceReview) {
      product.needsPriceReview = false;
      product.priceReviewNote = null as any;
    }
    return this.productsRepository.save(product);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const product = await this.findById(tenantId, id);
    await this.productsRepository.softRemove(product);
  }
}
