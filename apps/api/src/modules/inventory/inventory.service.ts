import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionsRepository: Repository<InventoryTransaction>,
    @InjectDataSource()
    private readonly dataSource: DataSource
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
        {
          search: `%${options.search}%`,
        }
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
   * Core stock-movement primitive used by Sales, Purchases, Adjustments and Transfers.
   * Uses a DB transaction + optimistic locking (version column) to stay safe under concurrency,
   * mirroring the update_inventory() SQL function documented in docs/DATABASE.md.
   */
  async adjustInventory(input: AdjustInventoryInput): Promise<InventoryTransaction> {
    return this.dataSource.transaction(async (manager) => {
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
          weightedAvgCost: input.unitCost || 0,
          lastCost: input.unitCost || 0,
        });
      }

      const newQuantity = Number(inventory.quantity) + input.quantity;
      if (newQuantity < 0) {
        throw new BadRequestException('الكمية المتاحة غير كافية');
      }

      // Recompute weighted average cost only on stock increases with a known cost
      if (input.quantity > 0 && input.unitCost !== undefined) {
        const currentQty = Number(inventory.quantity);
        const currentCost = Number(inventory.weightedAvgCost);
        inventory.weightedAvgCost =
          currentQty + input.quantity === 0
            ? input.unitCost
            : (currentQty * currentCost + input.quantity * input.unitCost) /
              (currentQty + input.quantity);
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
    });
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

  async transfer(
    tenantId: string,
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    userId?: string
  ) {
    const out = await this.adjustInventory({
      tenantId,
      productId,
      warehouseId: fromWarehouseId,
      quantity: -quantity,
      type: 'transfer_out',
      userId,
    });
    const inTxn = await this.adjustInventory({
      tenantId,
      productId,
      warehouseId: toWarehouseId,
      quantity,
      type: 'transfer_in',
      userId,
    });
    return { out, in: inTxn };
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
