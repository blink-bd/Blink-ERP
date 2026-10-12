import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WebhooksService } from '@/modules/integrations/webhooks.service';
import { Inventory } from './entities/inventory.entity';
import {
  InventoryTransaction,
  InventoryTransactionType,
} from './entities/inventory-transaction.entity';

interface AdjustInventoryInput {
  tenantId: string;
  productId: string;
  warehouseId: string;
  quantity: number; // signed: positive = increase, negative = decrease
  unitCost?: number;
  type: InventoryTransactionType;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
  userId?: string;
}

@Injectable()
export class InventoryService {
  private readonly lowStockNotifiedAt = new Map<string, number>();
  private static readonly LOW_STOCK_COOLDOWN_MS = 6 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionsRepository: Repository<InventoryTransaction>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService
  ) {}

  async getSummary(
    tenantId: string,
    options: { warehouseId?: string; search?: string; categoryId?: string } = {}
  ) {
    const query = this.inventoryRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('inv.warehouse', 'warehouse')
      .where('inv.tenantId = :tenantId', { tenantId });

    if (options.warehouseId) {
      query.andWhere('inv.warehouseId = :warehouseId', { warehouseId: options.warehouseId });
    }
    if (options.categoryId) {
      query.andWhere('product.categoryId = :categoryId', { categoryId: options.categoryId });
    }
    if (options.search) {
      query.andWhere(
        '(product.name ILIKE :search OR product.sku ILIKE :search OR product.barcode ILIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    const rows = await query.orderBy('product.name', 'ASC').getMany();

    return rows.map((r) => ({
      ...r,
      stockValue: Number(r.quantity) * Number(r.weightedAvgCost || r.product?.costPrice || 0),
      status:
        Number(r.availableQuantity) <= 0
          ? 'out_of_stock'
          : Number(r.availableQuantity) <= (r.product?.minStockLevel || 0)
            ? 'low_stock'
            : 'available',
    }));
  }

  async getTransactions(tenantId: string, productId?: string, warehouseId?: string) {
    const query = this.transactionsRepository
      .createQueryBuilder('txn')
      .where('txn.tenantId = :tenantId', { tenantId });

    if (productId) query.andWhere('txn.productId = :productId', { productId });
    if (warehouseId) query.andWhere('txn.warehouseId = :warehouseId', { warehouseId });

    return query.orderBy('txn.createdAt', 'DESC').limit(200).getMany();
  }

  /**
   * Core stock-movement primitive. Callers that own a larger transaction should
   * use adjustInventoryInTransaction so sale/purchase and stock never diverge.
   */
  async adjustInventory(input: AdjustInventoryInput): Promise<InventoryTransaction> {
    const transaction = await this.dataSource.transaction((manager) =>
      this.adjustInventoryInTransaction(manager, input)
    );
    void this.checkLowStock(input.tenantId, input.productId, input.warehouseId);
    return transaction;
  }

  async adjustInventoryInTransaction(
    manager: EntityManager,
    input: AdjustInventoryInput
  ): Promise<InventoryTransaction> {
    // The advisory lock also serializes first-time creation when no inventory row exists yet.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      input.tenantId,
      `${input.productId}:${input.warehouseId}`,
    ]);

    let inventory = await manager.findOne(Inventory, {
      where: {
        tenantId: input.tenantId,
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!inventory) {
      inventory = manager.create(Inventory, {
        tenantId: input.tenantId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: 0,
        reservedQuantity: 0,
        weightedAvgCost: input.unitCost || 0,
        lastCost: input.unitCost || 0,
      });
    }

    const currentQuantity = Number(inventory.quantity);
    const reservedQuantity = Number(inventory.reservedQuantity || 0);
    const newQuantity = currentQuantity + input.quantity;
    if (newQuantity < reservedQuantity || newQuantity < 0) {
      throw new BadRequestException('الكمية المتاحة غير كافية أو محجوزة لتحويل بانتظار الموافقة');
    }

    if (input.quantity > 0 && input.unitCost !== undefined) {
      const currentCost = Number(inventory.weightedAvgCost || 0);
      inventory.weightedAvgCost =
        newQuantity === 0
          ? input.unitCost
          : (currentQuantity * currentCost + input.quantity * input.unitCost) / newQuantity;
      inventory.lastCost = input.unitCost;
    }

    inventory.quantity = newQuantity;
    inventory.version = (inventory.version || 1) + 1;
    await manager.save(inventory);

    const transaction = manager.create(InventoryTransaction, {
      tenantId: input.tenantId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: input.quantity,
      unitCost: input.unitCost,
      balanceAfter: newQuantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      createdBy: input.userId,
    });

    return manager.save(transaction);
  }

  async adjustReservedQuantityInTransaction(
    manager: EntityManager,
    input: { tenantId: string; productId: string; warehouseId: string; quantity: number }
  ): Promise<Inventory> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      input.tenantId,
      `${input.productId}:${input.warehouseId}`,
    ]);
    const inventory = await manager.findOne(Inventory, {
      where: {
        tenantId: input.tenantId,
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!inventory) throw new BadRequestException('رصيد المخزون غير موجود');
    const nextReserved = Number(inventory.reservedQuantity || 0) + input.quantity;
    if (nextReserved < 0 || nextReserved > Number(inventory.quantity)) {
      throw new BadRequestException('الكمية المحجوزة للمرتجع غير صالحة');
    }
    inventory.reservedQuantity = nextReserved;
    inventory.version = (inventory.version || 1) + 1;
    return manager.save(inventory);
  }

  async checkLowStock(tenantId: string, productId: string, warehouseId: string): Promise<void> {
    try {
      const inventory = await this.inventoryRepository.findOne({
        where: { tenantId, productId, warehouseId },
        relations: ['product'],
      });
      const product = inventory?.product;
      if (!inventory || !product || !product.trackInventory) return;

      const available = Number(inventory.quantity) - Number(inventory.reservedQuantity);
      const minimum = Number(product.minStockLevel || 0);
      const key = `${tenantId}:${productId}:${warehouseId}`;
      if (available > minimum) {
        this.lowStockNotifiedAt.delete(key);
        return;
      }

      const now = Date.now();
      const lastSentAt = this.lowStockNotifiedAt.get(key) || 0;
      if (now - lastSentAt < InventoryService.LOW_STOCK_COOLDOWN_MS) return;
      this.lowStockNotifiedAt.set(key, now);

      const details = {
        tenantId,
        productId,
        productName: product.name,
        warehouseId,
        availableQuantity: available,
        minimumQuantity: minimum,
      };
      const alert = {
        event: 'inventory.low_stock',
        title: available <= 0 ? `نفد مخزون ${product.name}` : `انخفاض مخزون ${product.name}`,
        details,
      };
      void this.notifications.sendOperationalAlert(alert).catch(() => undefined);
      void this.webhooks.emit(tenantId, 'inventory.low_stock', details).catch(() => undefined);
    } catch {
      // تنبيهات المخزون مساندة ولا ينبغي أن تفشل عملية البيع/الشراء بسببها.
    }
  }

  async adjustManual(
    tenantId: string,
    productId: string,
    warehouseId: string,
    quantity: number,
    reason: string,
    userId?: string
  ) {
    return this.adjustInventory({
      tenantId,
      productId,
      warehouseId,
      quantity,
      type: 'adjustment',
      notes: reason,
      userId,
    });
  }

  async getAvailableQuantity(
    tenantId: string,
    productId: string,
    warehouseId: string
  ): Promise<number> {
    const inventory = await this.inventoryRepository.findOne({
      where: { tenantId, productId, warehouseId },
    });
    if (!inventory) return 0;
    return Number(inventory.quantity) - Number(inventory.reservedQuantity);
  }
}
