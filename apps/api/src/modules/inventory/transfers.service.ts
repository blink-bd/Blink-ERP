import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository, In } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WebhooksService } from '@/modules/integrations/webhooks.service';
import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryService } from './inventory.service';
import { InventoryTransaction } from './entities/inventory-transaction.entity';
import { InventoryTransfer } from './entities/inventory-transfer.entity';
import { InventoryTransferItem } from './entities/inventory-transfer-item.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { AuditService, AuditEntry } from '@/modules/audit/audit.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { tenantYear } from '@/common/utils/tenant-time';

/** بيانات الفاعل التي تُسجَّل في سجل التدقيق. */
export type TransferActor = Pick<AuditEntry, 'userEmail' | 'ip' | 'userAgent'>;

const TRANSFER_RELATIONS = {
  sourceBranch: true,
  destinationBranch: true,
  sourceWarehouse: true,
  destinationWarehouse: true,
  items: { product: true },
} as const;

@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(InventoryTransfer)
    private readonly transfers: Repository<InventoryTransfer>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly inventoryService: InventoryService,
    private readonly audit: AuditService
  ) {}

  /** warehouseIds: مخازن نطاق العمل — بيظهر التحويل لو المصدر أو الوجهة جوه النطاق (null = الكل). */
  async list(tenantId: string, status?: string, warehouseIds: string[] | null = null) {
    const base = {
      tenantId,
      deletedAt: IsNull(),
      ...(status && ['pending', 'approved', 'rejected'].includes(status)
        ? { status: status as any }
        : {}),
    };
    return this.transfers.find({
      where: warehouseIds
        ? [
            { ...base, sourceWarehouseId: In(warehouseIds) },
            { ...base, destinationWarehouseId: In(warehouseIds) },
          ]
        : base,
      relations: TRANSFER_RELATIONS,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findById(tenantId: string, id: string) {
    const transfer = await this.transfers.findOne({
      where: { tenantId, id, deletedAt: IsNull() },
      relations: TRANSFER_RELATIONS,
    });
    if (!transfer) throw new NotFoundException('طلب التحويل غير موجود');
    return transfer;
  }

  async create(tenantId: string, userId: string, dto: CreateTransferDto, actor?: TransferActor) {
    const aggregatedItems = new Map<string, number>();
    for (const item of dto.items || []) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('كمية التحويل يجب أن تكون أكبر من صفر');
      }
      aggregatedItems.set(
        item.productId,
        (aggregatedItems.get(item.productId) || 0) + item.quantity
      );
    }
    if (!aggregatedItems.size) throw new BadRequestException('أضف صنفاً واحداً على الأقل');

    const saved = await this.dataSource.transaction(async (manager) => {
      const [sourceWarehouse, destinationWarehouse] = await Promise.all([
        manager.findOne(Warehouse, {
          where: { id: dto.sourceWarehouseId, tenantId, deletedAt: IsNull(), isActive: true },
        }),
        manager.findOne(Warehouse, {
          where: { id: dto.destinationWarehouseId, tenantId, deletedAt: IsNull(), isActive: true },
        }),
      ]);
      if (!sourceWarehouse || !destinationWarehouse) {
        throw new NotFoundException('المخزن المصدر أو الوجهة غير موجود أو غير نشط');
      }
      if (sourceWarehouse.id === destinationWarehouse.id) {
        throw new BadRequestException('يجب اختيار مخزنين مختلفين');
      }
      if (!sourceWarehouse.branchId || !destinationWarehouse.branchId) {
        throw new BadRequestException('يجب ربط المخزنين بفرعين قبل طلب التحويل');
      }
      if (sourceWarehouse.branchId === destinationWarehouse.branchId) {
        throw new BadRequestException('التحويل المعتمد هنا بين فرعين مختلفين فقط');
      }

      const [sourceBranch, destinationBranch] = await Promise.all([
        manager.findOne(Branch, {
          where: { id: sourceWarehouse.branchId, tenantId, deletedAt: IsNull(), isActive: true },
        }),
        manager.findOne(Branch, {
          where: {
            id: destinationWarehouse.branchId,
            tenantId,
            deletedAt: IsNull(),
            isActive: true,
          },
        }),
      ]);
      if (!sourceBranch || !destinationBranch) {
        throw new NotFoundException('الفرع المصدر أو الوجهة غير موجود أو غير نشط');
      }

      const normalized = [...aggregatedItems.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      );
      for (const [productId, quantity] of normalized) {
        const product = await manager.findOne(Product, {
          where: { id: productId, tenantId, deletedAt: IsNull(), isActive: true },
        });
        if (!product || !product.trackInventory) {
          throw new BadRequestException('أحد الأصناف غير موجود أو لا يتتبع المخزون');
        }
        const inventory = await this.lockInventory(
          manager,
          tenantId,
          productId,
          sourceWarehouse.id
        );
        if (!inventory) {
          throw new BadRequestException(`لا يوجد رصيد للصنف ${product.name} في المخزن المصدر`);
        }
        const available = Number(inventory.quantity) - Number(inventory.reservedQuantity);
        if (available < quantity) {
          throw new BadRequestException(
            `الرصيد المتاح للصنف ${product.name} غير كافٍ (المتاح: ${available})`
          );
        }
        inventory.reservedQuantity = Number(inventory.reservedQuantity) + quantity;
        inventory.version = (inventory.version || 1) + 1;
        await manager.save(inventory);
      }

      const transfer = await manager.save(
        manager.create(InventoryTransfer, {
          tenantId,
          transferNumber: `TRF-${await tenantYear(manager, tenantId)}-${randomBytes(4).toString('hex').toUpperCase()}`,
          sourceBranchId: sourceBranch.id,
          destinationBranchId: destinationBranch.id,
          sourceWarehouseId: sourceWarehouse.id,
          destinationWarehouseId: destinationWarehouse.id,
          status: 'pending',
          notes: dto.notes?.trim() || undefined,
          createdBy: userId,
        })
      );

      const items = normalized.map(([productId, quantity]) =>
        manager.create(InventoryTransferItem, {
          tenantId,
          transferId: transfer.id,
          productId,
          quantity,
        })
      );
      await manager.save(items);
      return transfer;
    });

    const transfer = await this.findById(tenantId, saved.id);
    for (const item of transfer.items || []) {
      void this.inventoryService.checkLowStock(
        tenantId,
        item.productId,
        transfer.sourceWarehouseId
      );
    }
    const eventData = this.eventData(transfer);
    void this.notifications
      .sendTenantAlert(tenantId, {
        event: 'inventory.transfer.requested',
        title: `طلب تحويل مخزون ${transfer.transferNumber} بانتظار الموافقة`,
        details: eventData,
      })
      .catch(() => undefined);
    void this.webhooks.emit(tenantId, 'inventory.transfer.requested', eventData);
    await this.audit.log({
      tenantId,
      userId,
      userEmail: actor?.userEmail,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
      action: 'INVENTORY_TRANSFER_REQUESTED',
      entityType: 'inventory_transfer',
      entityId: transfer.id,
      newValues: {
        transferNumber: transfer.transferNumber,
        sourceWarehouseId: transfer.sourceWarehouseId,
        destinationWarehouseId: transfer.destinationWarehouseId,
        items: transfer.items?.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
        })),
      },
    });
    return transfer;
  }

  async approve(tenantId: string, id: string, approverId: string, actor?: TransferActor) {
    const transferId = await this.dataSource.transaction(async (manager) => {
      const transfer = await manager.findOne(InventoryTransfer, {
        where: { id, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!transfer) throw new NotFoundException('طلب التحويل غير موجود');
      if (transfer.status !== 'pending') {
        throw new BadRequestException('تمت معالجة طلب التحويل مسبقاً');
      }
      if (transfer.createdBy === approverId) {
        throw new ForbiddenException('لا يمكن لمُنشئ الطلب اعتماده؛ يجب أن يوافق مستخدم آخر');
      }

      const items = await manager.find(InventoryTransferItem, {
        where: { tenantId, transferId: transfer.id, deletedAt: IsNull() },
        order: { productId: 'ASC' },
      });
      if (!items.length) throw new BadRequestException('طلب التحويل لا يحتوي على أصناف');

      for (const item of items) {
        const source = await this.lockInventory(
          manager,
          tenantId,
          item.productId,
          transfer.sourceWarehouseId
        );
        if (
          !source ||
          Number(source.quantity) < Number(item.quantity) ||
          Number(source.reservedQuantity) < Number(item.quantity)
        ) {
          throw new BadRequestException(
            'لم يعد الرصيد المحجوز متاحاً؛ ارفض الطلب وأنشئ طلباً جديداً'
          );
        }

        const quantity = Number(item.quantity);
        const sourceCost = Number(source.weightedAvgCost || source.lastCost || 0);
        source.quantity = Number(source.quantity) - quantity;
        source.reservedQuantity = Number(source.reservedQuantity) - quantity;
        source.version = (source.version || 1) + 1;
        await manager.save(source);

        let destination = await this.lockInventory(
          manager,
          tenantId,
          item.productId,
          transfer.destinationWarehouseId
        );
        if (!destination) {
          destination = manager.create(Inventory, {
            tenantId,
            productId: item.productId,
            warehouseId: transfer.destinationWarehouseId,
            quantity: 0,
            reservedQuantity: 0,
            weightedAvgCost: 0,
            lastCost: 0,
          });
        }
        const destinationQuantity = Number(destination.quantity);
        const destinationCost = Number(destination.weightedAvgCost || 0);
        const resultingQuantity = destinationQuantity + quantity;
        destination.weightedAvgCost =
          resultingQuantity > 0
            ? (destinationQuantity * destinationCost + quantity * sourceCost) / resultingQuantity
            : sourceCost;
        destination.lastCost = sourceCost;
        destination.quantity = resultingQuantity;
        destination.version = (destination.version || 1) + 1;
        await manager.save(destination);

        item.unitCost = sourceCost;
        await manager.save(item);

        await manager.save(
          manager.create(InventoryTransaction, {
            tenantId,
            productId: item.productId,
            warehouseId: transfer.sourceWarehouseId,
            type: 'transfer_out',
            quantity: -quantity,
            unitCost: sourceCost,
            balanceAfter: Number(source.quantity),
            referenceType: 'inventory_transfer',
            referenceId: transfer.id,
            referenceNumber: transfer.transferNumber,
            notes: `تحويل معتمد إلى ${transfer.destinationBranchId}`,
            createdBy: approverId,
          })
        );
        await manager.save(
          manager.create(InventoryTransaction, {
            tenantId,
            productId: item.productId,
            warehouseId: transfer.destinationWarehouseId,
            type: 'transfer_in',
            quantity,
            unitCost: sourceCost,
            balanceAfter: Number(destination.quantity),
            referenceType: 'inventory_transfer',
            referenceId: transfer.id,
            referenceNumber: transfer.transferNumber,
            notes: `تحويل معتمد من ${transfer.sourceBranchId}`,
            createdBy: approverId,
          })
        );
      }

      transfer.status = 'approved';
      transfer.approvedBy = approverId;
      transfer.approvedAt = new Date();
      await manager.save(transfer);
      return transfer.id;
    });

    const transfer = await this.findById(tenantId, transferId);
    for (const item of transfer.items || []) {
      void this.inventoryService.checkLowStock(
        tenantId,
        item.productId,
        transfer.sourceWarehouseId
      );
    }
    const eventData = this.eventData(transfer);
    void this.notifications
      .sendTenantAlert(tenantId, {
        event: 'inventory.transfer.approved',
        title: `تم اعتماد تحويل المخزون ${transfer.transferNumber}`,
        details: eventData,
      })
      .catch(() => undefined);
    void this.webhooks.emit(tenantId, 'inventory.transfer.approved', eventData);
    await this.audit.log({
      tenantId,
      userId: approverId,
      userEmail: actor?.userEmail,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
      action: 'INVENTORY_TRANSFER_APPROVED',
      entityType: 'inventory_transfer',
      entityId: transfer.id,
      newValues: eventData,
      severity: 'warning',
    });
    return transfer;
  }

  async reject(
    tenantId: string,
    id: string,
    approverId: string,
    reason: string,
    actor?: TransferActor
  ) {
    const normalizedReason = reason?.trim();
    if (!normalizedReason) throw new BadRequestException('اكتب سبب رفض طلب التحويل');

    const transferId = await this.dataSource.transaction(async (manager) => {
      const transfer = await manager.findOne(InventoryTransfer, {
        where: { id, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!transfer) throw new NotFoundException('طلب التحويل غير موجود');
      if (transfer.status !== 'pending') {
        throw new BadRequestException('تمت معالجة طلب التحويل مسبقاً');
      }
      if (transfer.createdBy === approverId) {
        throw new ForbiddenException('لا يمكن لمُنشئ الطلب رفضه بنفسه؛ استخدم مستخدماً آخر');
      }

      const items = await manager.find(InventoryTransferItem, {
        where: { tenantId, transferId: transfer.id, deletedAt: IsNull() },
        order: { productId: 'ASC' },
      });
      for (const item of items) {
        const source = await this.lockInventory(
          manager,
          tenantId,
          item.productId,
          transfer.sourceWarehouseId
        );
        if (!source || Number(source.reservedQuantity) < Number(item.quantity)) {
          throw new BadRequestException('تعذر تحرير الكمية المحجوزة؛ راجع حركة المخزون');
        }
        source.reservedQuantity = Number(source.reservedQuantity) - Number(item.quantity);
        source.version = (source.version || 1) + 1;
        await manager.save(source);
      }

      transfer.status = 'rejected';
      transfer.rejectedBy = approverId;
      transfer.rejectedAt = new Date();
      transfer.rejectionReason = normalizedReason;
      await manager.save(transfer);
      return transfer.id;
    });

    const transfer = await this.findById(tenantId, transferId);
    for (const item of transfer.items || []) {
      void this.inventoryService.checkLowStock(
        tenantId,
        item.productId,
        transfer.sourceWarehouseId
      );
    }
    const eventData = { ...this.eventData(transfer), سبب_الرفض: transfer.rejectionReason };
    void this.notifications
      .sendTenantAlert(tenantId, {
        event: 'inventory.transfer.rejected',
        title: `تم رفض تحويل المخزون ${transfer.transferNumber}`,
        details: eventData,
      })
      .catch(() => undefined);
    void this.webhooks.emit(tenantId, 'inventory.transfer.rejected', eventData);
    await this.audit.log({
      tenantId,
      userId: approverId,
      userEmail: actor?.userEmail,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
      action: 'INVENTORY_TRANSFER_REJECTED',
      entityType: 'inventory_transfer',
      entityId: transfer.id,
      newValues: { ...eventData, reason: normalizedReason },
      severity: 'warning',
    });
    return transfer;
  }

  private async lockInventory(
    manager: EntityManager,
    tenantId: string,
    productId: string,
    warehouseId: string
  ): Promise<Inventory | null> {
    // Also serializes creation of a previously-missing inventory row.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      tenantId,
      `${productId}:${warehouseId}`,
    ]);
    return manager.findOne(Inventory, {
      where: { tenantId, productId, warehouseId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private eventData(transfer: InventoryTransfer): Record<string, unknown> {
    return {
      transferId: transfer.id,
      transferNumber: transfer.transferNumber,
      status: transfer.status,
      sourceBranch: transfer.sourceBranch?.name,
      destinationBranch: transfer.destinationBranch?.name,
      sourceWarehouse: transfer.sourceWarehouse?.name,
      destinationWarehouse: transfer.destinationWarehouse?.name,
      itemCount: transfer.items?.length || 0,
      items: (transfer.items || []).map((item) => ({
        productId: item.productId,
        productName: item.product?.name,
        quantity: Number(item.quantity),
      })),
      notes: transfer.notes,
    };
  }
}
