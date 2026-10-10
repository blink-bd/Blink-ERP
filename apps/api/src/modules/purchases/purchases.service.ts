import { assertWarehouseUsable } from '@/modules/inventory/location-limits';
import { FeaturesService } from '@/modules/features/features.service';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import { ProductsService } from '@/modules/products/products.service';

interface CreatePurchaseInput {
  supplierId: string;
  warehouseId: string;
  supplierInvoiceNumber?: string;
  items: { productId: string; quantity: number; unitCost: number; taxRate?: number }[];
  paidAmount?: number;
  notes?: string;
}

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase) private readonly purchasesRepository: Repository<Purchase>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly suppliersService: SuppliersService,
    private readonly productsService: ProductsService,
    private readonly featuresService: FeaturesService
  ) {}

  private async generatePurchaseNumber(manager: EntityManager, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const [row] = await manager.query(
      `INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
       VALUES ($1, 'purchase', $2, 2)
       ON CONFLICT (tenant_id, document_type, document_year)
       DO UPDATE SET next_value = document_counters.next_value + 1
       RETURNING next_value - 1 AS value`,
      [tenantId, year]
    );
    return `PO-${year}-${String(Number(row.value)).padStart(4, '0')}`;
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    page = Math.max(1, Number(page) || 1);
    limit = Math.min(100, Math.max(1, Number(limit) || 20));
    const [data, total] = await this.purchasesRepository.findAndCount({
      where: { tenantId },
      order: { purchaseDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(tenantId: string, id: string): Promise<Purchase> {
    const purchase = await this.purchasesRepository.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!purchase) throw new NotFoundException('أمر الشراء غير موجود');
    return purchase;
  }

  /**
   * Creates a purchase, increases stock (with weighted-average cost recalculation
   * via InventoryService), and updates the supplier's balance for any unpaid amount.
   */
  async create(tenantId: string, dto: CreatePurchaseInput, userId: string): Promise<Purchase> {
    return this.dataSource.transaction(async (manager) => {
      if (!dto.items?.length)
        throw new BadRequestException('أمر الشراء يجب أن يحتوي على صنف واحد على الأقل');
      const [supplier] = await manager.query(
        `SELECT id FROM suppliers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.supplierId, tenantId]
      );
      if (!supplier) throw new NotFoundException('المورد غير موجود في هذا التاجر');
      await assertWarehouseUsable(manager, this.featuresService, tenantId, dto.warehouseId);
      if (!Number.isFinite(Number(dto.paidAmount || 0)) || Number(dto.paidAmount || 0) < 0) {
        throw new BadRequestException('مبلغ السداد غير صحيح');
      }

      let subtotal = 0;
      let taxAmount = 0;
      const itemsToSave: Partial<PurchaseItem>[] = [];

      for (const itemInput of dto.items) {
        if (!Number.isFinite(itemInput.quantity) || itemInput.quantity <= 0) {
          throw new BadRequestException('كمية الشراء يجب أن تكون أكبر من صفر');
        }
        if (!Number.isFinite(itemInput.unitCost) || itemInput.unitCost < 0) {
          throw new BadRequestException('تكلفة الشراء غير صحيحة');
        }
        const lineSubtotal = itemInput.quantity * itemInput.unitCost;
        const taxRate = itemInput.taxRate || 0;
        if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
          throw new BadRequestException('نسبة الضريبة غير صحيحة');
        }
        const lineTax = (lineSubtotal * taxRate) / 100;

        subtotal += lineSubtotal;
        taxAmount += lineTax;

        itemsToSave.push({
          tenantId,
          productId: itemInput.productId,
          quantity: itemInput.quantity,
          unitCost: itemInput.unitCost,
          taxRate,
          taxAmount: lineTax,
          total: lineSubtotal + lineTax,
        });

        await this.inventoryService.adjustInventory(
          {
            tenantId,
            productId: itemInput.productId,
            warehouseId: dto.warehouseId,
            quantity: itemInput.quantity,
            unitCost: itemInput.unitCost,
            type: 'purchase',
            userId,
          },
          manager
        );

        // إذا أصبح سعر الشراء أعلى من تكلفة المنتج المسجلة، فعّل تنبيه المراجعة فقط.
        // لا نغيّر costPrice تلقائياً؛ يظل قرار تعديل التكلفة وأسعار البيع بيد التاجر.
        const product = await this.productsService.findById(tenantId, itemInput.productId);
        const oldCost = Number(product.costPrice);
        if (itemInput.unitCost > oldCost + 0.0001) {
          await this.productsService.update(
            tenantId,
            itemInput.productId,
            {
              needsPriceReview: true,
              priceReviewNote: `سعر الشراء الجديد ${itemInput.unitCost.toFixed(2)} أعلى من سعر التكلفة المسجل ${oldCost.toFixed(2)} في فاتورة شراء بتاريخ ${new Date().toLocaleDateString('ar')} — راجع سعر التكلفة وأسعار البيع`,
            } as any,
            userId,
            manager
          );
        }
      }

      const total = subtotal + taxAmount;
      const paidAmount = dto.paidAmount || 0;
      if (paidAmount > total) {
        throw new BadRequestException('مبلغ السداد لا يمكن أن يتجاوز إجمالي المشتريات');
      }
      const purchaseNumber = await this.generatePurchaseNumber(manager, tenantId);

      const purchase = manager.create(Purchase, {
        tenantId,
        purchaseNumber,
        supplierInvoiceNumber: dto.supplierInvoiceNumber,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        purchaseDate: new Date(),
        subtotal,
        taxAmount,
        total,
        paidAmount,
        paymentStatus: paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partial' : 'pending',
        notes: dto.notes,
        createdBy: userId,
      });

      const saved = await manager.save(purchase);

      for (const item of itemsToSave) {
        await manager.save(manager.create(PurchaseItem, { ...item, purchaseId: saved.id }));
      }

      if (total - paidAmount > 0) {
        await this.suppliersService.adjustBalance(
          tenantId,
          dto.supplierId,
          total - paidAmount,
          manager
        );
      }

      // لا نقرأ عبر repository خارج الـ transaction قبل commit؛ هذا كان يعيد
      // «أمر الشراء غير موجود» رغم نجاح إدخاله.
      const result = await manager.findOne(Purchase, {
        where: { id: saved.id, tenantId },
        relations: ['items'],
      });
      if (!result) throw new NotFoundException('أمر الشراء غير موجود بعد الحفظ');
      return result;
    });
  }
}
