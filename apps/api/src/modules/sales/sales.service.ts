import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { EntityManager, Repository, DataSource } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { SaleReturn } from './entities/sale-return.entity';
import { SaleReturnItem } from './entities/sale-return-item.entity';
import { ProductsService } from '@/modules/products/products.service';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { CustomersService } from '@/modules/customers/customers.service';

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
    private readonly customersService: CustomersService
  ) {}

  private async generateSaleNumber(manager: EntityManager, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const [row] = await manager.query(
      `INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
       VALUES ($1, 'sale', $2, 2)
       ON CONFLICT (tenant_id, document_type, document_year)
       DO UPDATE SET next_value = document_counters.next_value + 1
       RETURNING next_value - 1 AS value`,
      [tenantId, year]
    );
    return `INV-${year}-${String(Number(row.value)).padStart(4, '0')}`;
  }

  private async generatePaymentNumber(manager: EntityManager, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const [row] = await manager.query(
      `INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
       VALUES ($1, 'payment', $2, 2)
       ON CONFLICT (tenant_id, document_type, document_year)
       DO UPDATE SET next_value = document_counters.next_value + 1
       RETURNING next_value - 1 AS value`,
      [tenantId, year]
    );
    return `PAY-${year}-${String(Number(row.value)).padStart(4, '0')}`;
  }

  async findAll(
    tenantId: string,
    options: { page?: number; limit?: number; search?: string; status?: string } = {}
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
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
  async create(tenantId: string, dto: CreateSaleDto, userId: string): Promise<Sale> {
    return this.dataSource.transaction(async (manager) => {
      if (!dto.items?.length)
        throw new BadRequestException('الفاتورة يجب أن تحتوي على صنف واحد على الأقل');
      if (
        !Number.isFinite(Number(dto.discountAmount || 0)) ||
        Number(dto.discountAmount || 0) < 0
      ) {
        throw new BadRequestException('الخصم غير صحيح');
      }

      const [warehouse] = await manager.query(
        `SELECT id FROM warehouses WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.warehouseId, tenantId]
      );
      if (!warehouse) throw new NotFoundException('المخزن غير موجود في هذا التاجر');

      if (dto.customerId) {
        const [customer] = await manager.query(
          `SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [dto.customerId, tenantId]
        );
        if (!customer) throw new NotFoundException('العميل غير موجود في هذا التاجر');
      }

      const paymentMethods = new Set<string>();
      for (const payment of dto.payments || []) {
        if (paymentMethods.has(payment.methodId)) {
          throw new BadRequestException('لا يمكن تكرار طريقة الدفع نفسها في الفاتورة');
        }
        paymentMethods.add(payment.methodId);
      }
      if (paymentMethods.size) {
        const rows = await manager.query(
          `SELECT id FROM payment_methods WHERE tenant_id = $1 AND is_active = true AND id = ANY($2::uuid[])`,
          [tenantId, Array.from(paymentMethods)]
        );
        if (rows.length !== paymentMethods.size) {
          throw new BadRequestException('طريقة الدفع غير صالحة لهذا التاجر');
        }
      }

      let subtotal = 0;
      let taxAmount = 0;
      let cogs = 0;
      const itemsToSave: Partial<SaleItem>[] = [];

      for (const itemInput of dto.items) {
        const product = await this.productsService.findById(tenantId, itemInput.productId);

        // تحديد السعر تلقائيًا حسب الفئة (جملة/قطاعي) لو مش متبعت صراحة
        const serverPrice =
          itemInput.priceTier === 'wholesale' && product.wholesalePrice
            ? Number(product.wholesalePrice)
            : Number(product.sellingPrice);
        const unitPrice = itemInput.unitPrice ?? serverPrice;
        if (Math.abs(Number(unitPrice) - serverPrice) > 0.0001) {
          throw new BadRequestException('سعر البيع غير مطابق للسعر المعتمد للمنتج');
        }
        if (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) <= 0) {
          throw new BadRequestException('سعر البيع غير صحيح');
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
        const grossLine = itemInput.quantity * unitPrice;
        if (!Number.isFinite(discount) || discount < 0 || discount > grossLine) {
          throw new BadRequestException('خصم الصنف غير صحيح');
        }
        const lineSubtotal = grossLine - discount;
        const taxRate = itemInput.taxRate ?? Number(product.taxRate) ?? 0;
        if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
          throw new BadRequestException('نسبة الضريبة غير صحيحة');
        }
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
          await this.inventoryService.adjustInventory(
            {
              tenantId,
              productId: product.id,
              warehouseId: dto.warehouseId,
              quantity: -itemInput.quantity,
              type: 'sale',
              userId,
            },
            manager
          );
        }
      }

      const discountAmount = dto.discountAmount || 0;
      const total = subtotal - discountAmount + taxAmount;
      if (total < 0) throw new BadRequestException('إجمالي الفاتورة لا يمكن أن يكون سالبًا');
      const paidAmount = (dto.payments || []).reduce((sum, p) => sum + p.amount, 0);
      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        throw new BadRequestException('إجمالي الدفعات غير صحيح');
      }
      if (paidAmount > total) {
        throw new BadRequestException('إجمالي الدفعات لا يمكن أن يتجاوز إجمالي الفاتورة');
      }
      if (paidAmount < total && !dto.customerId) {
        throw new BadRequestException('يجب اختيار عميل عند تسجيل فاتورة آجلة أو جزئية');
      }
      const changeAmount = paidAmount > total ? paidAmount - total : 0;
      const paymentStatus = paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';

      const saleNumber = await this.generateSaleNumber(manager, tenantId);

      const sale = manager.create(Sale, {
        tenantId,
        saleNumber,
        customerId: dto.customerId,
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
            paymentNumber: await this.generatePaymentNumber(manager, tenantId),
            saleId: savedSale.id,
            customerId: dto.customerId,
            paymentMethodId: paymentInput.methodId,
            amount: paymentInput.amount,
            paymentDate: new Date(),
            referenceNumber: paymentInput.referenceNumber,
            createdBy: userId,
          })
        );
      }

      if (dto.customerId && paidAmount < total) {
        await this.customersService.adjustBalance(
          tenantId,
          dto.customerId,
          total - paidAmount,
          manager
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
      throw new BadRequestException('مبلغ الدفعة يجب أن يكون أكبر من صفر');
    }

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id: saleId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
      if (sale.status !== 'completed')
        throw new BadRequestException('لا يمكن الدفع على فاتورة غير مكتملة');

      const [method] = await manager.query(
        `SELECT id FROM payment_methods WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [methodId, tenantId]
      );
      if (!method) throw new BadRequestException('طريقة الدفع غير صالحة لهذا التاجر');

      const remaining = Math.max(0, Number(sale.total) - Number(sale.paidAmount));
      if (amount > remaining) {
        throw new BadRequestException('مبلغ الدفعة أكبر من المبلغ المتبقي');
      }

      const payment = manager.create(Payment, {
        tenantId,
        paymentNumber: await this.generatePaymentNumber(manager, tenantId),
        saleId,
        customerId: sale.customerId,
        paymentMethodId: methodId,
        amount,
        paymentDate: new Date(),
        referenceNumber,
        createdBy: userId,
      });
      await manager.save(payment);

      sale.paidAmount = Number(sale.paidAmount) + amount;
      sale.paymentStatus = sale.paidAmount >= sale.total ? 'paid' : 'partial';
      await manager.save(sale);

      if (sale.customerId) {
        await this.customersService.adjustBalance(tenantId, sale.customerId, -amount, manager);
      }

      return { payment, sale };
    });
  }

  async voidSale(tenantId: string, id: string, reason: string, userId: string): Promise<void> {
    if (!reason?.trim()) throw new BadRequestException('سبب إلغاء الفاتورة مطلوب');

    await this.dataSource.transaction(async (manager) => {
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

      for (const item of sale.items) {
        const [product] = await manager.query(
          `SELECT track_inventory AS "trackInventory"
           FROM products WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [item.productId, tenantId]
        );
        if (product?.trackInventory) {
          await this.inventoryService.adjustInventory(
            {
              tenantId,
              productId: item.productId,
              warehouseId: sale.warehouseId,
              quantity: item.quantity,
              type: 'return_in',
              referenceType: 'sale_void',
              referenceId: sale.id,
              userId,
            },
            manager
          );
        }
      }

      sale.status = 'cancelled';
      sale.voidedAt = new Date();
      sale.voidedBy = userId;
      sale.voidReason = reason.trim();
      await manager.save(sale);
    });
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
    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id: saleId, tenantId },
        relations: ['items'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
      if (sale.status !== 'completed' && sale.status !== 'returned') {
        throw new BadRequestException('لا يمكن إرجاع فاتورة ملغاة');
      }
      if (!dto.items?.length) throw new BadRequestException('يجب تحديد صنف واحد على الأقل للمرتجع');

      const returnedRows = await manager.query(
        `SELECT sale_item_id AS "saleItemId", COALESCE(SUM(quantity), 0) AS quantity
         FROM sale_return_items WHERE tenant_id = $1 GROUP BY sale_item_id`,
        [tenantId]
      );
      const alreadyReturned = new Map<string, number>(
        returnedRows.map((row: any) => [row.saleItemId, Number(row.quantity)])
      );
      const requestedInReturn = new Map<string, number>();

      let subtotal = 0;
      let taxAmount = 0;
      let cogsAdjustment = 0;
      const itemsToSave: Partial<SaleReturnItem>[] = [];

      for (const input of dto.items) {
        const saleItem = sale.items.find((i) => i.id === input.saleItemId);
        if (!saleItem) throw new NotFoundException('صنف الفاتورة غير موجود');
        const previous = alreadyReturned.get(saleItem.id) || 0;
        const requested = (requestedInReturn.get(saleItem.id) || 0) + Number(input.quantity);
        if (previous + requested > Number(saleItem.quantity)) {
          throw new BadRequestException('الكمية المسترجعة أكبر من الكمية المتبقية من الصنف');
        }
        requestedInReturn.set(saleItem.id, requested);

        const [product] = await manager.query(
          `SELECT track_inventory AS "trackInventory"
           FROM products WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [saleItem.productId, tenantId]
        );
        if (!product) throw new NotFoundException('المنتج غير موجود في هذا التاجر');

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

        // إرجاع الكمية للمخزون فقط للأصناف التي تتبع مخزونًا.
        if (product.trackInventory) {
          await this.inventoryService.adjustInventory(
            {
              tenantId,
              productId: saleItem.productId,
              warehouseId: sale.warehouseId,
              quantity: input.quantity,
              type: 'return_in',
              referenceType: 'sale_return',
              referenceId: sale.id,
              userId,
            },
            manager
          );
        }
      }

      const total = subtotal + taxAmount;
      const year = new Date().getFullYear();
      const [counter] = await manager.query(
        `INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
         VALUES ($1, 'return', $2, 2)
         ON CONFLICT (tenant_id, document_type, document_year)
         DO UPDATE SET next_value = document_counters.next_value + 1
         RETURNING next_value - 1 AS value`,
        [tenantId, year]
      );
      const returnNumber = `RET-${year}-${String(Number(counter.value)).padStart(4, '0')}`;

      const saleReturn = manager.create(SaleReturn, {
        tenantId,
        returnNumber,
        originalSaleId: sale.id,
        customerId: sale.customerId,
        warehouseId: sale.warehouseId,
        returnDate: new Date(),
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

      // المرتجع من فاتورة آجلة يقلل الرصيد المستحق. الفاتورة المدفوعة
      // تحتاج عملية رد مبلغ منفصلة، لذلك لا نخلق رصيدًا سالبًا للعميل تلقائيًا.
      if (sale.customerId && sale.paymentStatus !== 'paid') {
        const unpaid = Math.max(0, Number(sale.total) - Number(sale.paidAmount));
        const balanceReduction = Math.min(total, unpaid);
        if (balanceReduction > 0) {
          await this.customersService.adjustBalance(
            tenantId,
            sale.customerId,
            -balanceReduction,
            manager
          );
        }
      }

      // خصم قيمة المرتجع من إجمالي الفاتورة الأصلية حتى يعكس تقرير الأرباح الواقع الفعلي.
      sale.total = Math.max(0, Number(sale.total) - total);
      sale.cogs = Math.max(0, Number(sale.cogs) - cogsAdjustment);
      if (sale.total === 0) sale.status = 'returned';
      await manager.save(sale);

      return savedReturn;
    });
  }
}
