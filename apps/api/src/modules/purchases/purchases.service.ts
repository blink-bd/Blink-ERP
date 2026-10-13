import { randomBytes } from 'node:crypto';
import { assertWarehouseUsable } from '@/modules/inventory/location-limits';
import { FeaturesService } from '@/modules/features/features.service';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource, IsNull, In } from 'typeorm';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WebhooksService } from '@/modules/integrations/webhooks.service';
import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import { ProductsService } from '@/modules/products/products.service';
import { Product } from '@/modules/products/entities/product.entity';
import { Warehouse } from '@/modules/inventory/entities/warehouse.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { resolveTenantBranch } from '@/common/utils/branch-accounting';
import {
  AccessScope,
  UNRESTRICTED_SCOPE,
  assertRowAllowed,
  branchForWarehouseWrite,
} from '@/common/utils/access-scope';
import { safeTimezone, tenantYear } from '@/common/utils/tenant-time';
import { callingCodeFor, toInternationalPhone } from '@/common/utils/phone';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase) private readonly purchasesRepository: Repository<Purchase>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly suppliersService: SuppliersService,
    private readonly productsService: ProductsService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly featuresService: FeaturesService
  ) {}

  private async generatePurchaseNumber(manager: EntityManager, tenantId: string): Promise<string> {
    const year = await tenantYear(manager, tenantId);
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

  async findAll(tenantId: string, page = 1, limit = 20, scope: AccessScope = UNRESTRICTED_SCOPE) {
    page = Math.max(1, Number(page) || 1);
    limit = Math.min(100, Math.max(1, Number(limit) || 20));
    // فرع/مخزن العمل + صلاحيات المستخدم
    const where: Record<string, unknown> = { tenantId };
    if (scope.branchIds) where.branchId = In(scope.branchIds);
    if (scope.warehouseIds) where.warehouseId = In(scope.warehouseIds);
    const [data, total] = await this.purchasesRepository.findAndCount({
      where,
      order: { purchaseDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * توكن الرابط العام لفاتورة المشتريات (لإرسالها للمورد على الواتساب). الفواتير القديمة
   * بيتولد لها توكن عند أول مشاركة.
   */
  async getShareToken(tenantId: string, id: string): Promise<string> {
    const [row] = await this.dataSource.query(
      `SELECT share_token AS "shareToken" FROM purchases WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!row) throw new NotFoundException('فاتورة المشتريات غير موجودة');
    if (row.shareToken) return row.shareToken;
    const [updated] = await this.dataSource.query(
      `UPDATE purchases SET share_token = COALESCE(share_token, $3)
       WHERE id = $1 AND tenant_id = $2 RETURNING share_token AS "shareToken"`,
      [id, tenantId, randomBytes(32).toString('hex')]
    );
    return updated?.[0]?.shareToken ?? updated?.shareToken;
  }

  /** بيانات إرسال فاتورة المشتريات للمورد على الواتساب (لينك + ملخص + رقم المورد). */
  async getShareInfo(tenantId: string, id: string) {
    const token = await this.getShareToken(tenantId, id);
    const [row] = await this.dataSource.query(
      `SELECT p.purchase_number AS "number", p.purchase_date AS "date", p.total,
              p.paid_amount AS "paid", p.supplier_invoice_number AS "supplierInvoiceNumber",
              s.name AS "partyName", s.phone AS "partyPhone",
              t.currency, t.timezone, t.country,
              COALESCE(t.business_name_ar, t.business_name) AS "businessName"
       FROM purchases p
       JOIN tenants t ON t.id = p.tenant_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.tenant_id = p.tenant_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId]
    );
    const items = await this.dataSource.query(
      `SELECT COALESCE(pr.name, 'صنف') AS "name", pi.quantity
       FROM purchase_items pi
       LEFT JOIN products pr ON pr.id = pi.product_id AND pr.tenant_id = pi.tenant_id
       WHERE pi.purchase_id = $1 AND pi.tenant_id = $2
       ORDER BY pi.created_at, pi.id`,
      [id, tenantId]
    );
    const total = Number(row.total) || 0;
    const paid = Number(row.paid) || 0;
    const timezone = safeTimezone(row.timezone);
    return {
      kind: 'purchase' as const,
      token,
      path: `/purchase-invoice/${token}`,
      documentNumber: row.number,
      supplierInvoiceNumber: row.supplierInvoiceNumber || undefined,
      date: row.date,
      currency: row.currency,
      timezone,
      businessName: row.businessName,
      party: row.partyName
        ? {
            type: 'supplier' as const,
            name: row.partyName,
            phone: row.partyPhone || null,
            whatsapp: toInternationalPhone(row.partyPhone, callingCodeFor(timezone, row.country)),
          }
        : null,
      totals: {
        total,
        paid,
        returned: 0,
        remaining: Math.max(0, Math.round((total - paid) * 100) / 100),
      },
      items: items.map((item: any) => ({ name: item.name, quantity: Number(item.quantity) })),
    };
  }

  assertInScope(tenantId: string, id: string, scope: AccessScope): Promise<void> {
    return assertRowAllowed(this.dataSource.manager, 'purchases', tenantId, id, scope);
  }

  async findById(tenantId: string, id: string): Promise<Purchase> {
    const purchase = await this.purchasesRepository.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!purchase) throw new NotFoundException('أمر الشراء غير موجود');
    return purchase;
  }

  async create(
    tenantId: string,
    dto: CreatePurchaseDto,
    userId: string,
    assignedBranchId?: string
  ): Promise<Purchase> {
    if (!dto.items?.length) {
      throw new BadRequestException('أمر الشراء يجب أن يحتوي على صنف واحد على الأقل');
    }
    const paidInput = Number(dto.paidAmount || 0);
    if (!Number.isFinite(paidInput) || paidInput < 0) {
      throw new BadRequestException('مبلغ السداد غير صحيح');
    }

    const purchase = await this.dataSource.transaction(async (manager) => {
      const [supplier] = await manager.query(
        `SELECT id FROM suppliers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.supplierId, tenantId]
      );
      if (!supplier) throw new NotFoundException('المورد غير موجود في هذا التاجر');

      await assertWarehouseUsable(manager, this.featuresService, tenantId, dto.warehouseId);
      const warehouse = await manager.findOne(Warehouse, {
        where: { id: dto.warehouseId, tenantId, deletedAt: IsNull(), isActive: true },
      });
      if (!warehouse) throw new NotFoundException('المخزن غير موجود أو غير نشط');
      const branchId = await resolveTenantBranch(
        manager,
        tenantId,
        branchForWarehouseWrite(warehouse, assignedBranchId)
      );

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
        const taxRate = Number(itemInput.taxRate || 0);
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

        await this.inventoryService.adjustInventoryInTransaction(manager, {
          tenantId,
          productId: itemInput.productId,
          warehouseId: dto.warehouseId,
          quantity: itemInput.quantity,
          unitCost: itemInput.unitCost,
          type: 'purchase',
          userId,
        });

        // Keep the tenant's cost unchanged; flag a higher supplier price for review.
        const product = await manager.findOne(Product, {
          where: { id: itemInput.productId, tenantId, deletedAt: IsNull() },
        });
        if (!product) throw new NotFoundException('المنتج غير موجود في هذا التاجر');
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
      const paidAmount = paidInput;
      if (paidAmount > total) {
        throw new BadRequestException('مبلغ السداد لا يمكن أن يتجاوز إجمالي المشتريات');
      }
      const purchaseNumber = await this.generatePurchaseNumber(manager, tenantId);
      const saved = await manager.save(
        manager.create(Purchase, {
          tenantId,
          purchaseNumber,
          supplierInvoiceNumber: dto.supplierInvoiceNumber,
          supplierId: dto.supplierId,
          branchId,
          warehouseId: dto.warehouseId,
          purchaseDate: new Date(),
          shareToken: randomBytes(32).toString('hex'),
          subtotal,
          taxAmount,
          total,
          paidAmount,
          paymentStatus: paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partial' : 'pending',
          notes: dto.notes,
          createdBy: userId,
        })
      );

      for (const item of itemsToSave) {
        await manager.save(manager.create(PurchaseItem, { ...item, purchaseId: saved.id }));
      }

      if (total - paidAmount > 0) {
        await this.suppliersService.adjustBalanceInTransaction(
          manager,
          tenantId,
          dto.supplierId,
          total - paidAmount,
          branchId
        );
      }

      const result = await manager.findOne(Purchase, {
        where: { id: saved.id, tenantId },
        relations: ['items'],
      });
      if (!result) throw new NotFoundException('أمر الشراء غير موجود بعد الحفظ');
      return result;
    });

    await this.suppliersService.checkSupplierPayablesLimit(tenantId);
    const eventData = {
      purchaseId: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      total: Number(purchase.total),
      paidAmount: Number(purchase.paidAmount),
      paymentStatus: purchase.paymentStatus,
      itemCount: purchase.items?.length || 0,
    };
    for (const item of dto.items) {
      void this.inventoryService.checkLowStock(tenantId, item.productId, dto.warehouseId);
    }
    void this.notifications
      .sendTenantAlert(tenantId, {
        event: 'purchase.created',
        title: `فاتورة مشتريات جديدة ${purchase.purchaseNumber}`,
        details: eventData,
      })
      .catch(() => undefined);
    void this.webhooks.emit(tenantId, 'purchase.created', eventData);
    return purchase;
  }
}
