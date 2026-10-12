import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, EntityManager } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WebhooksService } from '@/modules/integrations/webhooks.service';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { ResolveReturnItemDto } from './dto/resolve-return-item.dto';
import { SaleReturn } from './entities/sale-return.entity';
import { SaleReturnItem } from './entities/sale-return-item.entity';
import { ProductsService } from '@/modules/products/products.service';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { CustomersService } from '@/modules/customers/customers.service';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import { Product } from '@/modules/products/entities/product.entity';
import { Warehouse } from '@/modules/inventory/entities/warehouse.entity';
import { adjustBranchPartyBalance, resolveTenantBranch } from '@/common/utils/branch-accounting';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale) private readonly salesRepository: Repository<Sale>,
    @InjectRepository(SaleItem) private readonly saleItemsRepository: Repository<SaleItem>,
    @InjectRepository(Payment) private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodsRepository: Repository<PaymentMethod>,
    @InjectRepository(SaleReturn) private readonly returnsRepository: Repository<SaleReturn>,
    @InjectRepository(SaleReturnItem)
    private readonly returnItemsRepository: Repository<SaleReturnItem>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly productsService: ProductsService,
    private readonly inventoryService: InventoryService,
    private readonly customersService: CustomersService,
    private readonly suppliersService: SuppliersService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService
  ) {}

  private async generateSaleNumber(tenantId: string): Promise<string> {
    const count = await this.salesRepository.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async findAll(
    tenantId: string,
    options: { page?: number; limit?: number; search?: string; status?: string } = {}
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const query = this.salesRepository
      .createQueryBuilder('sale')
      .where('sale.tenantId = :tenantId', { tenantId });

    if (options.search) {
      query.andWhere('sale.saleNumber ILIKE :search', { search: `%${options.search}%` });
    }
    if (options.status) {
      query.andWhere('sale.status = :status', { status: options.status });
    }

    const [data, total] = await query
      .orderBy('sale.saleDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(tenantId: string, id: string): Promise<Sale> {
    const sale = await this.salesRepository.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
    return sale;
  }

  /**
   * Creates a POS sale: validates stock, computes totals/COGS, deducts inventory,
   * records payments, and updates customer balance for any unpaid remainder — all
   * inside a single DB transaction for consistency.
   */
  async create(
    tenantId: string,
    dto: CreateSaleDto,
    userId: string,
    assignedBranchId?: string
  ): Promise<Sale> {
    const sale = await this.dataSource.transaction(async (manager) => {
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
      let cogs = 0;
      const itemsToSave: Partial<SaleItem>[] = [];

      for (const itemInput of dto.items) {
        const product = await this.productsService.findById(tenantId, itemInput.productId);

        // تحديد السعر تلقائيًا حسب الفئة (جملة/قطاعي) لو مش متبعت صراحة
        let unitPrice = itemInput.unitPrice;
        if (unitPrice === undefined || unitPrice === null) {
          unitPrice =
            itemInput.priceTier === 'wholesale' && product.wholesalePrice
              ? Number(product.wholesalePrice)
              : Number(product.sellingPrice);
        }

        if (product.trackInventory) {
          const available = await this.inventoryService.getAvailableQuantity(
            tenantId,
            product.id,
            dto.warehouseId
          );
          if (available < itemInput.quantity) {
            throw new BadRequestException({
              code: 'INSUFFICIENT_STOCK',
              message: 'الكمية المتاحة غير كافية',
              details: {
                productId: product.id,
                productName: product.name,
                requestedQuantity: itemInput.quantity,
                availableQuantity: available,
              },
            });
          }
        }

        const discount = itemInput.discountAmount || 0;
        const lineSubtotal = itemInput.quantity * unitPrice - discount;
        const taxRate = itemInput.taxRate ?? Number(product.taxRate) ?? 0;
        const lineTax = (lineSubtotal * taxRate) / 100;
        const lineTotal = lineSubtotal + lineTax;
        const lineCost = itemInput.quantity * Number(product.costPrice);

        subtotal += lineSubtotal;
        taxAmount += lineTax;
        cogs += lineCost;

        itemsToSave.push({
          tenantId,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          productBarcode: product.barcode,
          quantity: itemInput.quantity,
          unit: product.unit,
          unitPrice,
          discountAmount: discount,
          taxRate,
          taxAmount: lineTax,
          subtotal: lineSubtotal,
          total: lineTotal,
          unitCost: Number(product.costPrice),
        });

        if (product.trackInventory) {
          await this.inventoryService.adjustInventoryInTransaction(manager, {
            tenantId,
            productId: product.id,
            warehouseId: dto.warehouseId,
            quantity: -itemInput.quantity,
            type: 'sale',
            userId,
          });
        }
      }

      const discountAmount = dto.discountAmount || 0;
      const total = subtotal - discountAmount + taxAmount;
      const paidAmount = (dto.payments || []).reduce((sum, p) => sum + p.amount, 0);
      const changeAmount = paidAmount > total ? paidAmount - total : 0;
      const paymentStatus = paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';

      const saleNumber = await this.generateSaleNumber(tenantId);

      const sale = manager.create(Sale, {
        tenantId,
        saleNumber,
        receiptToken: randomBytes(32).toString('hex'),
        customerId: dto.customerId,
        branchId,
        warehouseId: dto.warehouseId,
        saleDate: new Date(),
        subtotal,
        discountAmount,
        taxAmount,
        total,
        paidAmount: Math.min(paidAmount, total),
        changeAmount,
        paymentStatus,
        cogs,
        status: 'completed',
        notes: dto.notes,
        createdBy: userId,
      });

      const savedSale = await manager.save(sale);

      for (const item of itemsToSave) {
        await manager.save(manager.create(SaleItem, { ...item, saleId: savedSale.id }));
      }

      for (const paymentInput of dto.payments || []) {
        await manager.save(
          manager.create(Payment, {
            tenantId,
            paymentNumber: `PAY-${savedSale.saleNumber}-${Math.random().toString(36).slice(2, 6)}`,
            saleId: savedSale.id,
            customerId: dto.customerId,
            branchId,
            paymentMethodId: paymentInput.methodId,
            amount: paymentInput.amount,
            paymentDate: new Date(),
            referenceNumber: paymentInput.referenceNumber,
            createdBy: userId,
          })
        );
      }

      if (dto.customerId && paidAmount < total) {
        await this.customersService.adjustBalanceInTransaction(
          manager,
          tenantId,
          dto.customerId,
          total - paidAmount,
          branchId
        );
      }

      // لا تستخدم repository خارج transaction هنا؛ الفاتورة غير ملتزمة بعد،
      // وكان ذلك سبب ظهور رسالة «الفاتورة غير موجودة» بعد الضغط على الدفع.
      const result = await manager.findOne(Sale, {
        where: { id: savedSale.id, tenantId },
        relations: ['items'],
      });
      if (!result) throw new NotFoundException('الفاتورة غير موجودة بعد الحفظ');
      return result;
    });

    const receiptPath = `/receipt/${sale.receiptToken}`;
    const publicAppUrl = (
      this.config.get<string>('PUBLIC_APP_URL') ||
      this.config.get<string>('FRONTEND_URL') ||
      ''
    ).replace(/\/$/, '');
    const eventData = {
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      total: Number(sale.total),
      paidAmount: Number(sale.paidAmount),
      paymentStatus: sale.paymentStatus,
      itemCount: sale.items?.length || 0,
      receiptUrl: publicAppUrl ? `${publicAppUrl}${receiptPath}` : receiptPath,
    };
    for (const item of sale.items || []) {
      void this.inventoryService.checkLowStock(tenantId, item.productId, sale.warehouseId);
    }
    void this.notifications
      .sendOperationalAlert({
        event: 'sale.created',
        title: `فاتورة بيع جديدة ${sale.saleNumber}`,
        details: { tenantId, ...eventData },
      })
      .catch(() => undefined);
    void this.webhooks.emit(tenantId, 'sale.created', eventData);
    return sale;
  }

  async addPayment(
    tenantId: string,
    saleId: string,
    methodId: string,
    amount: number,
    referenceNumber: string | undefined,
    userId: string
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    }
    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id: saleId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale || sale.status !== 'completed')
        throw new NotFoundException('الفاتورة غير موجودة أو غير مكتملة');
      const remaining = Number(sale.total) - Number(sale.paidAmount);
      if (amount > remaining)
        throw new BadRequestException('المبلغ أكبر من المبلغ المستحق على الفاتورة');

      const method = await manager.findOne(PaymentMethod, {
        where: { id: methodId, tenantId, isActive: true },
      });
      if (!method) throw new NotFoundException('طريقة الدفع غير موجودة أو غير نشطة');

      const payment = await manager.save(
        manager.create(Payment, {
          tenantId,
          paymentNumber: `PAY-${sale.saleNumber}-${randomBytes(4).toString('hex').toUpperCase()}`,
          saleId,
          customerId: sale.customerId,
          branchId: sale.branchId,
          paymentMethodId: methodId,
          amount,
          paymentDate: new Date(),
          referenceNumber,
          createdBy: userId,
        })
      );
      sale.paidAmount = Number(sale.paidAmount) + amount;
      sale.paymentStatus = sale.paidAmount >= Number(sale.total) ? 'paid' : 'partial';
      await manager.save(sale);

      if (sale.customerId) {
        await this.customersService.adjustBalanceInTransaction(
          manager,
          tenantId,
          sale.customerId,
          -amount,
          sale.branchId
        );
      }
      return { payment, sale };
    });
  }

  async voidSale(tenantId: string, id: string, reason: string, userId: string): Promise<void> {
    const result = await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id, tenantId },
        relations: ['items'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
      if (sale.status !== 'completed') throw new BadRequestException('الفاتورة ليست مكتملة');
      if (Number(sale.paidAmount) > 0) {
        throw new BadRequestException('لا يمكن إلغاء فاتورة تم الدفع عليها');
      }
      const existingReturns = await manager.count(SaleReturn, {
        where: { tenantId, originalSaleId: sale.id },
      });
      if (existingReturns > 0) {
        throw new BadRequestException('لا يمكن إلغاء فاتورة لها مرتجعات مسجلة');
      }

      const trackedProductIds: string[] = [];
      for (const item of sale.items || []) {
        const product = await manager.findOne(Product, {
          where: { id: item.productId, tenantId },
        });
        if (!product?.trackInventory) continue;
        await this.inventoryService.adjustInventoryInTransaction(manager, {
          tenantId,
          productId: item.productId,
          warehouseId: sale.warehouseId,
          quantity: Number(item.quantity),
          type: 'return_in',
          referenceType: 'sale_void',
          referenceId: sale.id,
          userId,
        });
        trackedProductIds.push(item.productId);
      }

      if (sale.customerId) {
        await this.customersService.adjustBalanceInTransaction(
          manager,
          tenantId,
          sale.customerId,
          -Number(sale.total),
          sale.branchId
        );
      }
      sale.status = 'cancelled';
      sale.voidedAt = new Date();
      sale.voidedBy = userId;
      sale.voidReason = reason?.trim();
      await manager.save(sale);
      return { productIds: trackedProductIds, warehouseId: sale.warehouseId };
    });

    for (const productId of result.productIds) {
      void this.inventoryService.checkLowStock(tenantId, productId, result.warehouseId);
    }
  }

  async getDefaultPaymentMethods(tenantId: string): Promise<PaymentMethod[]> {
    return this.paymentMethodsRepository.find({
      where: { tenantId, isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  /**
   * استرجاع صنف (أو أكثر) من فاتورة بيع: بيرجّع الكمية للمخزون، وبيعدّل
   * رصيد العميل (لو الفاتورة كانت آجلة) أو يسجّل مبلغ مسترد (لو كانت متحصّلة).
   * كل عملية استرجاع بتتحفظ كمرجع دائم في sale_returns وتظهر في كشف حساب العميل.
   */
  async createReturn(
    tenantId: string,
    saleId: string,
    dto: CreateReturnDto,
    userId: string
  ): Promise<SaleReturn> {
    if (!dto.items?.length) throw new BadRequestException('أضف صنفاً واحداً على الأقل للمرتجع');
    const saleReturn = await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id: saleId, tenantId },
        relations: ['items'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
      if (sale.status !== 'completed')
        throw new BadRequestException('لا يمكن إرجاع فاتورة غير مكتملة');

      let subtotal = 0;
      let taxAmount = 0;
      let cogsAdjustment = 0;
      const itemsToSave: Partial<SaleReturnItem>[] = [];
      const requestedReturnByItem = new Map<string, number>();

      for (const input of dto.items) {
        const saleItem = sale.items.find((i) => i.id === input.saleItemId);
        if (!saleItem) throw new NotFoundException('صنف الفاتورة غير موجود');
        if (input.quantity > Number(saleItem.quantity)) {
          throw new BadRequestException('الكمية المسترجعة أكبر من الكمية المباعة');
        }

        const unitPrice = Number(saleItem.unitPrice);
        const lineTotal = unitPrice * input.quantity;
        const lineTax = (lineTotal * Number(saleItem.taxRate)) / 100;
        subtotal += lineTotal;
        taxAmount += lineTax;
        cogsAdjustment += Number(saleItem.unitCost) * input.quantity;

        itemsToSave.push({
          tenantId,
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          quantity: input.quantity,
          unitPrice,
          taxRate: saleItem.taxRate,
          taxAmount: lineTax,
          total: lineTotal + lineTax,
          unitCost: saleItem.unitCost,
        });

        const previouslyReturned = await manager.query(
          `SELECT COALESCE(SUM(quantity), 0) AS quantity
           FROM sale_return_items WHERE tenant_id = $1 AND sale_item_id = $2`,
          [tenantId, saleItem.id]
        );
        const requestedBefore = requestedReturnByItem.get(saleItem.id) || 0;
        if (
          Number(previouslyReturned[0]?.quantity || 0) + requestedBefore + input.quantity >
          Number(saleItem.quantity)
        ) {
          throw new BadRequestException('إجمالي الكمية المسترجعة يتجاوز الكمية المباعة');
        }
        requestedReturnByItem.set(saleItem.id, requestedBefore + input.quantity);

        // تُضاف القطعة المرتجعة إلى رصيد فعلي محجوز للفحص حتى لا تباع قبل تحديد مصيرها.
        const product = await manager.findOne(Product, {
          where: { id: saleItem.productId, tenantId, deletedAt: IsNull() },
        });
        if (!product) throw new NotFoundException('المنتج المرتجع غير موجود');
        if (product.trackInventory) {
          await this.inventoryService.adjustInventoryInTransaction(manager, {
            tenantId,
            productId: saleItem.productId,
            warehouseId: sale.warehouseId,
            quantity: input.quantity,
            type: 'return_in',
            referenceType: 'sale_return',
            referenceId: sale.id,
            userId,
          });
          await this.inventoryService.adjustReservedQuantityInTransaction(manager, {
            tenantId,
            productId: saleItem.productId,
            warehouseId: sale.warehouseId,
            quantity: input.quantity,
          });
        }
      }

      const total = subtotal + taxAmount;
      const count = await manager.count(SaleReturn, { where: { tenantId } });
      const returnNumber = `RET-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

      const saleReturn = manager.create(SaleReturn, {
        tenantId,
        returnNumber,
        originalSaleId: sale.id,
        customerId: sale.customerId,
        branchId: sale.branchId,
        warehouseId: sale.warehouseId,
        returnDate: new Date(),
        status: 'pending_inspection',
        subtotal,
        taxAmount,
        total,
        refundAmount: total,
        cogsAdjustment,
        reason: dto.reason,
        createdBy: userId,
      });
      const savedReturn = await manager.save(saleReturn);

      for (const item of itemsToSave) {
        await manager.save(manager.create(SaleReturnItem, { ...item, returnId: savedReturn.id }));
      }

      // تعديل رصيد العميل: لو الفاتورة كانت عليها مبلغ مستحق، ننزّله؛ غير كده يُسجَّل كمسترد نقدي
      if (sale.customerId) {
        await this.customersService.adjustBalanceInTransaction(
          manager,
          tenantId,
          sale.customerId,
          -total,
          sale.branchId
        );
      }

      // تبقى قيمة الفاتورة الأصلية كما صدرت؛ يُسجل المرتجع كحركة مستقلة ويُحتسب صافياً في التقارير.
      return savedReturn;
    });

    const sale = await this.findById(tenantId, saleId);
    for (const item of dto.items) {
      const saleItem = sale.items?.find((candidate) => candidate.id === item.saleItemId);
      if (saleItem) {
        void this.inventoryService.checkLowStock(tenantId, saleItem.productId, sale.warehouseId);
      }
    }
    return saleReturn;
  }

  async findReturns(tenantId: string, status?: string) {
    const query = this.returnsRepository
      .createQueryBuilder('saleReturn')
      .leftJoinAndSelect('saleReturn.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('saleReturn.originalSale', 'sale')
      .where('saleReturn.tenantId = :tenantId', { tenantId });
    if (status) query.andWhere('saleReturn.status = :status', { status });
    return query.orderBy('saleReturn.returnDate', 'DESC').take(100).getMany();
  }

  async resolveReturnItem(
    tenantId: string,
    returnId: string,
    itemId: string,
    userId: string,
    dto: ResolveReturnItemDto
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const saleReturn = await manager.findOne(SaleReturn, {
        where: { id: returnId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!saleReturn) throw new NotFoundException('المرتجع غير موجود');
      if (saleReturn.status !== 'pending_inspection') {
        throw new BadRequestException('هذا المرتجع ليس بانتظار الفحص');
      }

      const item = await manager.findOne(SaleReturnItem, {
        where: { id: itemId, tenantId, returnId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('صنف المرتجع غير موجود');
      if (item.disposition !== 'pending') {
        throw new BadRequestException('تم تحديد مصير هذا الصنف مسبقاً');
      }

      const originalProduct = await manager.findOne(Product, {
        where: { id: item.productId, tenantId, deletedAt: IsNull() },
      });
      if (!originalProduct) throw new NotFoundException('المنتج المرتجع غير موجود');
      const quantity = Number(item.quantity);
      const originalUnitCost = Number(item.unitCost);
      const supplierCredit = originalUnitCost * quantity;
      const repairExpense = Number(dto.repairExpense || 0);
      if (!Number.isFinite(repairExpense) || repairExpense < 0) {
        throw new BadRequestException('تكلفة الصيانة أو الهالك غير صالحة');
      }
      const branchId = await resolveTenantBranch(manager, tenantId, saleReturn.branchId);

      if (originalProduct.trackInventory) {
        await this.inventoryService.adjustReservedQuantityInTransaction(manager, {
          tenantId,
          productId: originalProduct.id,
          warehouseId: saleReturn.warehouseId,
          quantity: -quantity,
        });
        await this.inventoryService.adjustInventoryInTransaction(manager, {
          tenantId,
          productId: originalProduct.id,
          warehouseId: saleReturn.warehouseId,
          quantity: -quantity,
          unitCost: originalUnitCost,
          type: dto.disposition === 'supplier' ? 'supplier_return' : 'return_out',
          referenceType: 'sale_return_disposition',
          referenceId: saleReturn.id,
          referenceNumber: saleReturn.returnNumber,
          notes: `إخراج الكمية المرتجعة من الصنف الأصلي (${dto.disposition})`,
          userId,
        });
      }

      if (dto.disposition === 'supplier') {
        if (!dto.supplierId) throw new BadRequestException('اختر المورد الذي ستُعاد إليه البضاعة');
        const [supplier] = await manager.query(
          `SELECT id FROM suppliers
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_active = true
           FOR UPDATE`,
          [dto.supplierId, tenantId]
        );
        if (!supplier) throw new NotFoundException('المورد غير موجود أو غير نشط');
        await manager.query(
          `UPDATE suppliers
           SET balance = balance - $3, balance_reminder_anchor_at = CURRENT_TIMESTAMP,
               balance_reminder_last_sent_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2`,
          [dto.supplierId, tenantId, supplierCredit]
        );
        await adjustBranchPartyBalance(
          manager,
          tenantId,
          'supplier',
          dto.supplierId,
          -supplierCredit,
          branchId
        );
        await manager.query(
          `UPDATE balance_reminder_events SET resolved_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1 AND party_type = 'supplier' AND party_id = $2 AND resolved_at IS NULL`,
          [tenantId, dto.supplierId]
        );
        await manager.query(
          `INSERT INTO supplier_returns
             (tenant_id, supplier_id, branch_id, sale_return_id, sale_return_item_id,
              quantity, unit_cost, amount, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            tenantId,
            dto.supplierId,
            branchId,
            saleReturn.id,
            item.id,
            quantity,
            originalUnitCost,
            supplierCredit,
            userId,
          ]
        );
        item.disposition = 'supplier';
        item.supplierId = dto.supplierId;
      } else {
        const newProduct = await this.createReturnedProduct(
          manager,
          tenantId,
          userId,
          originalProduct,
          dto.product
        );
        await this.inventoryService.adjustInventoryInTransaction(manager, {
          tenantId,
          productId: newProduct.id,
          warehouseId: saleReturn.warehouseId,
          quantity,
          unitCost: Number(newProduct.costPrice),
          type: 'return_in',
          referenceType: 'sale_return_disposition',
          referenceId: saleReturn.id,
          referenceNumber: saleReturn.returnNumber,
          notes: `إعادة إدخال المرتجع كصنف مستقل: ${newProduct.name}`,
          userId,
        });
        item.disposition = 'restocked';
        item.newProductId = newProduct.id;
      }

      item.repairExpense = repairExpense;
      await manager.save(item);
      if (repairExpense > 0) {
        await this.createReturnedItemExpense(
          manager,
          tenantId,
          userId,
          branchId,
          saleReturn.returnNumber,
          item.id,
          originalProduct.name,
          repairExpense
        );
      }

      // يُسجل عكس تكلفة البضاعة المرتجعة في تقرير فترة المرتجع بعد اعتماد الفحص.
      const pendingItems = await manager.count(SaleReturnItem, {
        where: { tenantId, returnId, disposition: 'pending' },
      });
      if (pendingItems === 0) {
        saleReturn.status = 'completed';
        await manager.save(saleReturn);
      }

      return {
        itemId: item.id,
        disposition: item.disposition,
        newProductId: item.newProductId,
        supplierId: item.supplierId,
        supplierCredit,
        repairExpense,
        pendingItems,
        warehouseId: saleReturn.warehouseId,
        productId: originalProduct.id,
      };
    });

    if (result.disposition === 'supplier') {
      await this.suppliersService.checkSupplierPayablesLimit(tenantId);
    }
    void this.inventoryService.checkLowStock(tenantId, result.productId, result.warehouseId);
    if (result.newProductId) {
      void this.inventoryService.checkLowStock(tenantId, result.newProductId, result.warehouseId);
    }
    return result;
  }

  private async createReturnedProduct(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    originalProduct: Product,
    input?: ResolveReturnItemDto['product']
  ): Promise<Product> {
    if (!input) throw new BadRequestException('أدخل بيانات الصنف المستقل الجديد');
    const name = input.name?.trim();
    const sku = input.sku?.trim() || null;
    const barcode = input.barcode?.trim() || null;
    const costPrice = Number(input.costPrice);
    const sellingPrice = Number(input.sellingPrice);
    const wholesalePrice = input.wholesalePrice == null ? null : Number(input.wholesalePrice);
    if (!name) throw new BadRequestException('اسم الصنف الجديد مطلوب');
    if (!sku && !barcode)
      throw new BadRequestException('أدخل رمز الصنف أو الباركود الجديد على الأقل');
    if (
      !Number.isFinite(costPrice) ||
      costPrice < 0 ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice <= costPrice
    ) {
      throw new BadRequestException('يجب أن يكون سعر البيع أكبر من تكلفة الصنف');
    }
    if (
      wholesalePrice !== null &&
      (!Number.isFinite(wholesalePrice) || wholesalePrice <= costPrice)
    ) {
      throw new BadRequestException('سعر الجملة يجب أن يكون أكبر من تكلفة الصنف');
    }
    const [duplicate] = await manager.query(
      `SELECT id FROM products WHERE tenant_id = $1
       AND (($2::varchar IS NOT NULL AND sku = $2) OR ($3::varchar IS NOT NULL AND barcode = $3))
       LIMIT 1`,
      [tenantId, sku, barcode]
    );
    if (duplicate)
      throw new BadRequestException('رمز الصنف أو الباركود مستخدم بالفعل؛ أدخل قيمة مستقلة');

    const categoryId = input.categoryId || originalProduct.categoryId || null;
    const brandId = input.brandId || originalProduct.brandId || null;
    if (categoryId) {
      const [category] = await manager.query(
        'SELECT id FROM categories WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [categoryId, tenantId]
      );
      if (!category) throw new BadRequestException('فئة المنتج المحددة غير صالحة');
    }
    if (brandId) {
      const [brand] = await manager.query(
        'SELECT id FROM brands WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [brandId, tenantId]
      );
      if (!brand) throw new BadRequestException('علامة المنتج المحددة غير صالحة');
    }

    return manager.save(
      manager.create(Product, {
        tenantId,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        name,
        sku: sku || undefined,
        barcode: barcode || undefined,
        description: input.description?.trim() || originalProduct.description,
        specifications: originalProduct.specifications || {},
        costPrice,
        sellingPrice,
        wholesalePrice: wholesalePrice ?? undefined,
        taxRate: input.taxRate ?? Number(originalProduct.taxRate || 0),
        isTaxInclusive: originalProduct.isTaxInclusive,
        trackInventory: true,
        minStockLevel: 0,
        unit: input.unit?.trim() || originalProduct.unit || 'piece',
        imageUrl: originalProduct.imageUrl,
        images: originalProduct.images || [],
        isActive: true,
        isFeatured: false,
        parentProductId: undefined,
        variantAttributes: {},
        needsPriceReview: false,
        createdBy: userId,
      })
    );
  }

  private async createReturnedItemExpense(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    branchId: string | undefined,
    returnNumber: string,
    itemId: string,
    productName: string,
    amount: number
  ) {
    const [category] = await manager.query(
      `INSERT INTO expense_categories (tenant_id, name, name_ar, is_active)
       VALUES ($1, 'Returned goods repair and waste', 'صيانة وهالك المرتجعات', true)
       ON CONFLICT (tenant_id, name) DO UPDATE SET is_active = true
       RETURNING id`,
      [tenantId]
    );
    const expenseNumber = `EXP-${new Date().getFullYear()}-RET-${returnNumber}-${itemId.slice(0, 8)}`;
    await manager.query(
      `INSERT INTO expenses
         (tenant_id, expense_number, category_id, branch_id, amount, expense_date,
          description, notes, status, created_by, approved_at, approved_by)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, 'approved', $8, CURRENT_TIMESTAMP, $8)`,
      [
        tenantId,
        expenseNumber,
        category.id,
        branchId || null,
        amount,
        `تكلفة صيانة أو هالك للصنف المرتجع: ${productName}`,
        `مرتجع البيع رقم ${returnNumber}`,
        userId,
      ]
    );
  }
}
