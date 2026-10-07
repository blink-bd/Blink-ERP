import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
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
    // نستخدم INNER JOIN للمنتج والمخزن حتى لا تُرجع أي سجلات مخزون "يتيمة"
    // مرتبطة بمنتج أو مخزن محذوف (حذفًا منطقيًا) أو مفقود — كانت هذه السجلات
    // ترجع بـ product/warehouse = null وتسبب شاشة بيضاء في الواجهة.
    // (لا نحذف السجلات اليتيمة من قاعدة البيانات؛ فقط لا نعيدها في الملخص.)
    const query = this.inventoryRepository
      .createQueryBuilder('inv')
      .innerJoinAndSelect('inv.product', 'product', 'product.tenantId = :tenantId', { tenantId })
      .innerJoinAndSelect('inv.warehouse', 'warehouse', 'warehouse.tenantId = :tenantId', {
        tenantId,
      })
      .leftJoinAndSelect('product.category', 'category')
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

    const toFiniteNumber = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return rows.map((r) => {
      const quantity = toFiniteNumber(r.quantity);
      const unitCost = toFiniteNumber(r.weightedAvgCost) || toFiniteNumber(r.product?.costPrice);
      const available = toFiniteNumber(r.availableQuantity);
      return {
        ...r,
        stockValue: quantity * unitCost,
        status:
          available <= 0
            ? 'out_of_stock'
            : available <= toFiniteNumber(r.product?.minStockLevel)
              ? 'low_stock'
              : 'available',
      };
    });
  }

  async getTransactions(tenantId: string, productId?: string, warehouseId?: string) {
    const query = this.transactionsRepository
      .createQueryBuilder('txn')
      .where('txn.tenantId = :tenantId', { tenantId });

    if (productId) query.andWhere('txn.productId = :productId', { productId });
    if (warehouseId) query.andWhere('txn.warehouseId = :warehouseId', { warehouseId });

    return query.orderBy('txn.createdAt', 'DESC').limit(200).getMany();
  }

  private async assertTenantReferences(
    manager: EntityManager,
    tenantId: string,
    productId: string,
    warehouseId: string
  ): Promise<void> {
    const [product] = await manager.query(
      `SELECT id FROM products WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [productId, tenantId]
    );
    if (!product) throw new NotFoundException('المنتج غير موجود في هذا التاجر');

    const [warehouse] = await manager.query(
      `SELECT id FROM warehouses WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [warehouseId, tenantId]
    );
    if (!warehouse) throw new NotFoundException('المخزن غير موجود في هذا التاجر');
  }

  private async adjustWithManager(
    manager: EntityManager,
    input: AdjustInventoryInput
  ): Promise<InventoryTransaction> {
    if (!Number.isFinite(input.quantity) || input.quantity === 0) {
      throw new BadRequestException('كمية حركة المخزون غير صحيحة');
    }
    if (input.quantity > 0 && input.unitCost !== undefined && input.unitCost < 0) {
      throw new BadRequestException('تكلفة المخزون لا يمكن أن تكون سالبة');
    }

    await this.assertTenantReferences(manager, input.tenantId, input.productId, input.warehouseId);

    // Lock the logical stock key even when the row does not exist yet. This
    // prevents two concurrent first movements from creating inconsistent rows.
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `${input.tenantId}:${input.productId}:${input.warehouseId}`,
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
        weightedAvgCost: input.unitCost || 0,
        lastCost: input.unitCost || 0,
      });
    }

    const newQuantity = Number(inventory.quantity) + input.quantity;
    const availableAfter = newQuantity - Number(inventory.reservedQuantity || 0);
    if (newQuantity < 0 || availableAfter < 0) {
      throw new BadRequestException('الكمية المتاحة غير كافية');
    }

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
  }

  /**
   * Uses the caller's transaction when provided. Financial workflows must pass
   * their EntityManager so stock changes roll back with the sale or purchase.
   */
  async adjustInventory(
    input: AdjustInventoryInput,
    manager?: EntityManager
  ): Promise<InventoryTransaction> {
    if (manager) return this.adjustWithManager(manager, input);
    return this.dataSource.transaction((transactionManager) =>
      this.adjustWithManager(transactionManager, input)
    );
  }

  async adjustManual(
    tenantId: string,
    productId: string,
    warehouseId: string,
    quantity: number,
    reason: string,
    userId?: string
  ) {
    if (!reason?.trim()) throw new BadRequestException('سبب تعديل المخزون مطلوب');
    return this.adjustInventory({
      tenantId,
      productId,
      warehouseId,
      quantity,
      type: 'adjustment',
      notes: reason.trim(),
      userId,
    });
  }

  async transfer(
    tenantId: string,
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    userId?: string,
    manager?: EntityManager
  ) {
    if (fromWarehouseId === toWarehouseId) {
      throw new BadRequestException('مخزن المصدر والوجهة يجب أن يكونا مختلفين');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('كمية النقل يجب أن تكون أكبر من صفر');
    }

    const execute = async (transactionManager: EntityManager) => {
      const out = await this.adjustWithManager(transactionManager, {
        tenantId,
        productId,
        warehouseId: fromWarehouseId,
        quantity: -quantity,
        type: 'transfer_out',
        userId,
      });
      const inTxn = await this.adjustWithManager(transactionManager, {
        tenantId,
        productId,
        warehouseId: toWarehouseId,
        quantity,
        type: 'transfer_in',
        userId,
      });
      return { out, in: inTxn };
    };

    return manager ? execute(manager) : this.dataSource.transaction(execute);
  }

  async getAvailableQuantity(
    tenantId: string,
    productId: string,
    warehouseId: string,
    manager?: EntityManager
  ): Promise<number> {
    const repository = manager ? manager.getRepository(Inventory) : this.inventoryRepository;
    const inventory = await repository.findOne({
      where: { tenantId, productId, warehouseId },
    });
    if (!inventory) return 0;
    return Number(inventory.quantity) - Number(inventory.reservedQuantity);
  }
}
