import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WebhooksService } from '@/modules/integrations/webhooks.service';
import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import { ProductsService } from '@/modules/products/products.service';
import { Warehouse } from '@/modules/inventory/entities/warehouse.entity';
import { resolveTenantBranch } from '@/common/utils/branch-accounting';

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
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService
  ) {}

  private async generatePurchaseNumber(tenantId: string): Promise<string> {
    const count = await this.purchasesRepository.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    return `PO-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
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
  async create(
    tenantId: string,
    dto: CreatePurchaseInput,
    userId: string,
    assignedBranchId?: string
  ): Promise<Purchase> {
    const purchase = await this.dataSource.transaction(async (manager) => {
      const warehouse = await manager.findOne(Warehouse, {
        where: { id: dto.warehouseId, tenantId, deletedAt: IsNull(), isActive: true },
      });
      if (!warehouse) throw new NotFoundException('المخزن غير موجود أو غير نشط');
      const branchId = await resolveTenantBranch(
        manager,
        tenantId,
        warehouse.branchId || assignedBranchId
      );
      let subtotal = 0;
      let taxAmount = 0;
      const itemsToSave: Partial<PurchaseItem>[] = [];

      for (const itemInput of dto.items) {
        const lineSubtotal = itemInput.quantity * itemInput.unitCost;
        const taxRate = itemInput.taxRate || 0;
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

        // تحديث تكلفة المنتج يتم في نفس معاملة الشراء والمخزون.
        await this.productsService.applyPurchaseCostChangeInTransaction(
          manager,
          tenantId,
          itemInput.productId,
          itemInput.unitCost,
          userId
        );
      }

      const total = subtotal + taxAmount;
      const paidAmount = dto.paidAmount || 0;
      const purchaseNumber = await this.generatePurchaseNumber(tenantId);

      const purchase = manager.create(Purchase, {
        tenantId,
        purchaseNumber,
        supplierInvoiceNumber: dto.supplierInvoiceNumber,
        supplierId: dto.supplierId,
        branchId,
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
        await this.suppliersService.adjustBalanceInTransaction(
          manager,
          tenantId,
          dto.supplierId,
          total - paidAmount,
          branchId
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
      .sendOperationalAlert({
        event: 'purchase.created',
        title: `فاتورة مشتريات جديدة ${purchase.purchaseNumber}`,
        details: { tenantId, ...eventData },
      })
      .catch(() => undefined);
    void this.webhooks.emit(tenantId, 'purchase.created', eventData);
    return purchase;
  }
}
