import { assertWarehouseUsable } from '@/modules/inventory/location-limits';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
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
import { FeaturesService } from '@/modules/features/features.service';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import { Product } from '@/modules/products/entities/product.entity';
import { Warehouse } from '@/modules/inventory/entities/warehouse.entity';
import { resolveTenantBranch } from '@/common/utils/branch-accounting';
import {
  AccessScope,
  UNRESTRICTED_SCOPE,
  assertRowAllowed,
  qbIn,
} from '@/common/utils/access-scope';
import { safeTimezone, tenantYear } from '@/common/utils/tenant-time';
import { callingCodeFor, toInternationalPhone } from '@/common/utils/phone';

const HALF_WHOLESALE_FEATURE_CODE = 'half_wholesale_pricing';

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
    private readonly config: ConfigService,
    private readonly featuresService: FeaturesService
  ) {}

  private async generateSaleNumber(manager: EntityManager, tenantId: string): Promise<string> {
    const year = await tenantYear(manager, tenantId);
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
    const year = await tenantYear(manager, tenantId);
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
    options: { page?: number; limit?: number; search?: string; status?: string } = {},
    scope: AccessScope = UNRESTRICTED_SCOPE
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const query = this.salesRepository
      .createQueryBuilder('sale')
      .where('sale.tenantId = :tenantId', { tenantId });
    // فرع/مخزن العمل + صلاحيات المستخدم
    qbIn(query, 'sale.branchId', scope.branchIds, 'scopeBranchIds');
    qbIn(query, 'sale.warehouseId', scope.warehouseIds, 'scopeWarehouseIds');

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

    // قيمة المرتجعات على كل فاتورة + المتبقي الفعلي بعد خصم المرتجعات (للعرض).
    const ids = data.map((sale) => sale.id);
    const returnRows = ids.length
      ? await this.dataSource.query(
          `SELECT original_sale_id AS "saleId", COUNT(*)::int AS count,
                  COALESCE(SUM(total), 0) AS total, COALESCE(SUM(invoice_credit), 0) AS credited
           FROM sale_returns WHERE tenant_id = $1 AND original_sale_id = ANY($2::uuid[])
           GROUP BY original_sale_id`,
          [tenantId, ids]
        )
      : [];
    const returnsBySale = new Map<string, any>(returnRows.map((r: any) => [r.saleId, r]));
    const rows = data.map((sale) => {
      const r = returnsBySale.get(sale.id);
      const returnedTotal = Number(r?.total || 0);
      const credited = Number(r?.credited || 0);
      return {
        ...sale,
        returnsCount: Number(r?.count || 0),
        returnedTotal,
        remainingAmount: Math.max(0, Number(sale.total) - Number(sale.paidAmount) - credited),
        fullyReturned: returnedTotal > 0 && returnedTotal >= Number(sale.total) - 0.0001,
      };
    });

    return { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /** يتأكد إن الفاتورة/المرتجع تابع لفرع ومخزن مسموح للمستخدم. */
  assertInScope(
    table: 'sales' | 'sale_returns',
    tenantId: string,
    id: string,
    scope: AccessScope
  ): Promise<void> {
    return assertRowAllowed(this.dataSource.manager, table, tenantId, id, scope);
  }

  async findById(tenantId: string, id: string): Promise<Sale> {
    const sale = await this.salesRepository.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!sale) throw new NotFoundException('الفاتورة غير موجودة');

    if (sale.items?.length) {
      const itemIds = sale.items.map((item) => item.id);
      const rows = await this.returnItemsRepository
        .createQueryBuilder('returnItem')
        .select('returnItem.saleItemId', 'saleItemId')
        .addSelect('COALESCE(SUM(returnItem.quantity), 0)', 'returnedQuantity')
        .where('returnItem.tenantId = :tenantId', { tenantId })
        .andWhere('returnItem.saleItemId IN (:...itemIds)', { itemIds })
        .groupBy('returnItem.saleItemId')
        .getRawMany();
      const returnedByItem = new Map<string, number>(
        rows.map((row: any) => [row.saleItemId, Number(row.returnedQuantity) || 0])
      );
      for (const item of sale.items) {
        const returned = returnedByItem.get(item.id) || 0;
        item.returnedQuantity = returned;
        item.remainingQuantity = Math.max(0, Number((Number(item.quantity) - returned).toFixed(4)));
      }
    }

    const [returns] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(invoice_credit), 0) AS credited, COALESCE(SUM(refund_paid), 0) AS refunded
       FROM sale_returns WHERE tenant_id = $1 AND original_sale_id = $2`,
      [tenantId, sale.id]
    );
    const [firstPayment] = await this.dataSource.query(
      `SELECT p.payment_method_id AS "methodId" FROM payments p
       JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE p.tenant_id = $1 AND p.sale_id = $2 AND pm.code <> 'credit'
       ORDER BY p.amount DESC, p.created_at ASC LIMIT 1`,
      [tenantId, sale.id]
    );
    // ملخص المرتجعات على الفاتورة (للعرض وتقدير تقسيم المرتجع الجديد).
    (sale as any).returnsSummary = {
      count: Number(returns?.count || 0),
      returnedTotal: Number(returns?.total || 0),
      invoiceCredit: Number(returns?.credited || 0),
      refunded: Number(returns?.refunded || 0),
      remainingAmount: Math.max(
        0,
        Number(sale.total) - Number(sale.paidAmount) - Number(returns?.credited || 0)
      ),
      paymentMethodId: firstPayment?.methodId || null,
    };
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
    assignedBranchId?: string,
    /** قيود لوحة المدير العام على نقطة البيع (false = الإجراء مقفول للتاجر). */
    restrictions: { allowCredit?: boolean } = {}
  ): Promise<Sale> {
    if (!dto.items?.length)
      throw new BadRequestException('الفاتورة يجب أن تحتوي على صنف واحد على الأقل');
    const invoiceDiscount = Number(dto.discountAmount || 0);
    if (!Number.isFinite(invoiceDiscount) || invoiceDiscount < 0) {
      throw new BadRequestException('الخصم غير صحيح');
    }

    const sale = await this.dataSource.transaction(async (manager) => {
      await assertWarehouseUsable(manager, this.featuresService, tenantId, dto.warehouseId);
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

        // تحديد السعر تلقائيًا حسب الفئة (جملة/قطاعي) لو مش متبعت صراحة.
        // تسعير نصف الجملة يُتحقق منه على الخادم أيضاً؛ إخفاء الخيار في الواجهة ليس حماية.
        if (itemInput.priceTier === 'half_wholesale') {
          const allowed = await this.featuresService.tenantHasFeature(
            tenantId,
            HALF_WHOLESALE_FEATURE_CODE
          );
          if (
            !allowed ||
            product.halfWholesalePrice === null ||
            product.halfWholesalePrice === undefined
          ) {
            throw new BadRequestException('ميزة تسعير نصف الجملة غير متاحة لهذا المنتج أو الحساب');
          }
        }
        const serverPrice =
          itemInput.priceTier === 'wholesale' && product.wholesalePrice
            ? Number(product.wholesalePrice)
            : itemInput.priceTier === 'half_wholesale'
              ? Number(product.halfWholesalePrice)
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
        if (lineSubtotal < lineCost) {
          throw new BadRequestException({
            code: 'PRICE_BELOW_COST',
            message: `لا يمكن بيع الصنف (${product.name}) بأقل من سعر التكلفة`,
            details: {
              productId: product.id,
              costPrice: Number(product.costPrice),
              unitPrice,
              lineTotalAfterDiscount: lineSubtotal,
              lineCost,
            },
          });
        }

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

      const discountAmount = invoiceDiscount;
      if (discountAmount > subtotal) throw new BadRequestException('الخصم يتجاوز إجمالي الأصناف');
      const netBeforeTax = subtotal - discountAmount;
      if (netBeforeTax < cogs) {
        throw new BadRequestException({
          code: 'INVOICE_BELOW_COST',
          message: 'لا يمكن إتمام البيع: إجمالي الفاتورة بعد الخصم أقل من إجمالي تكلفة البضاعة',
          details: { netBeforeTax, totalCost: cogs },
        });
      }
      const total = netBeforeTax + taxAmount;
      if (total < 0) throw new BadRequestException('إجمالي الفاتورة لا يمكن أن يكون سالبًا');
      const paidAmount = (dto.payments || []).reduce((sum, p) => sum + p.amount, 0);
      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        throw new BadRequestException('إجمالي الدفعات غير صحيح');
      }
      if (paidAmount > total) {
        throw new BadRequestException('إجمالي الدفعات لا يمكن أن يتجاوز إجمالي الفاتورة');
      }
      if (paidAmount + 0.0001 < total && restrictions.allowCredit === false) {
        throw new ForbiddenException({
          code: 'FEATURE_DISABLED',
          feature: 'pos.credit_sale',
          message: 'البيع الآجل والدفع الجزئي مش مفعّل لحسابك. تواصل مع الإدارة لتفعيله',
        });
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
            paymentNumber: await this.generatePaymentNumber(manager, tenantId),
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
      .sendTenantAlert(tenantId, {
        event: 'sale.created',
        title: `فاتورة بيع جديدة ${sale.saleNumber}`,
        details: eventData,
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
      // المتبقي = الإجمالي − المدفوع − اللي اتخصم منها بمرتجعات.
      const [returned] = await manager.query(
        `SELECT COALESCE(SUM(invoice_credit), 0) AS credited
         FROM sale_returns WHERE tenant_id = $1 AND original_sale_id = $2`,
        [tenantId, sale.id]
      );
      const credited = Number(returned?.credited || 0);
      const remaining = Number(sale.total) - Number(sale.paidAmount) - credited;
      if (amount > remaining + 0.0001)
        throw new BadRequestException('المبلغ أكبر من المبلغ المستحق على الفاتورة');

      const method = await manager.findOne(PaymentMethod, {
        where: { id: methodId, tenantId, isActive: true },
      });
      if (!method) throw new NotFoundException('طريقة الدفع غير موجودة أو غير نشطة');

      const payment = await manager.save(
        manager.create(Payment, {
          tenantId,
          paymentNumber: await this.generatePaymentNumber(manager, tenantId),
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
      sale.paymentStatus =
        sale.paidAmount + credited >= Number(sale.total) - 0.0001 ? 'paid' : 'partial';
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
    if (!reason?.trim()) throw new BadRequestException('سبب إلغاء الفاتورة مطلوب');
    const result = await this.dataSource.transaction(async (manager) => {
      // بدون relations مع القفل: FOR UPDATE لا يعمل على الجانب الاختياري من LEFT JOIN.
      const sale = await manager.findOne(Sale, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
      sale.items = await manager.find(SaleItem, { where: { saleId: sale.id, tenantId } });
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

  /**
   * بيانات إرسال الفاتورة للعميل على الواتساب: اللينك العام (الإيصال الإلكتروني) + ملخص
   * الفاتورة + رقم موبايل العميل المحفوظ بصيغة دولية.
   */
  async getShareInfo(tenantId: string, id: string) {
    const [row] = await this.dataSource.query(
      `SELECT s.id, s.sale_number AS "number", s.sale_date AS "date", s.total,
              s.paid_amount AS "paid", s.receipt_token AS "token", s.status,
              c.name AS "partyName", c.phone AS "partyPhone",
              t.currency, t.timezone, t.country,
              COALESCE(t.business_name_ar, t.business_name) AS "businessName",
              COALESCE((SELECT SUM(r.total) FROM sale_returns r
                        WHERE r.tenant_id = s.tenant_id AND r.original_sale_id = s.id), 0) AS "returned",
              COALESCE((SELECT SUM(r.invoice_credit) FROM sale_returns r
                        WHERE r.tenant_id = s.tenant_id AND r.original_sale_id = s.id), 0) AS "credited"
       FROM sales s
       JOIN tenants t ON t.id = s.tenant_id
       LEFT JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [id, tenantId]
    );
    if (!row) throw new NotFoundException('الفاتورة غير موجودة');
    if (row.status !== 'completed') throw new BadRequestException('الفاتورة ملغاة');
    const items = await this.dataSource.query(
      `SELECT product_name AS "name", quantity FROM sale_items
       WHERE sale_id = $1 AND tenant_id = $2 ORDER BY created_at, id`,
      [id, tenantId]
    );
    const total = Number(row.total) || 0;
    const paid = Number(row.paid) || 0;
    const timezone = safeTimezone(row.timezone);
    return {
      kind: 'sale' as const,
      token: row.token,
      path: `/receipt/${row.token}`,
      documentNumber: row.number,
      date: row.date,
      currency: row.currency,
      timezone,
      businessName: row.businessName,
      party: row.partyName
        ? {
            type: 'customer' as const,
            name: row.partyName,
            phone: row.partyPhone || null,
            whatsapp: toInternationalPhone(row.partyPhone, callingCodeFor(timezone, row.country)),
          }
        : null,
      totals: {
        total,
        paid,
        returned: Number(row.returned) || 0,
        remaining: Math.max(0, Math.round((total - paid - Number(row.credited || 0)) * 100) / 100),
      },
      items: items.map((item: any) => ({ name: item.name, quantity: Number(item.quantity) })),
    };
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

    const returnResult = await this.dataSource.transaction(async (manager) => {
      // نقفل الفاتورة نفسها بدون relations: PostgreSQL يرفض FOR UPDATE على الجانب
      // الاختياري من LEFT JOIN (كان يسبب فشل كل عمليات المرتجع).
      const sale = await manager.findOne(Sale, {
        where: { id: saleId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
      if (!['completed', 'returned'].includes(sale.status)) {
        throw new BadRequestException('لا يمكن إرجاع فاتورة ملغاة أو غير مكتملة');
      }
      const saleItems = await manager.find(SaleItem, {
        where: { saleId: sale.id, tenantId },
      });
      sale.items = saleItems;
      if (!saleItems.length) throw new BadRequestException('الفاتورة لا تحتوي على أصناف');

      const requested = new Map<string, number>();
      for (const input of dto.items) {
        const quantity = Number(input.quantity);
        if (!input.saleItemId || !Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException('صنف المرتجع أو كميته غير صحيحة');
        }
        requested.set(input.saleItemId, (requested.get(input.saleItemId) || 0) + quantity);
      }
      const saleItemIds = saleItems.map((item) => item.id);
      const previousRows = await manager.query(
        `SELECT sale_item_id AS "saleItemId", COALESCE(SUM(quantity), 0) AS "returnedQuantity"
         FROM sale_return_items
         WHERE tenant_id = $1 AND sale_item_id = ANY($2::uuid[])
         GROUP BY sale_item_id`,
        [tenantId, saleItemIds]
      );
      const alreadyReturned = new Map<string, number>(
        previousRows.map((row: any) => [row.saleItemId, Number(row.returnedQuantity) || 0])
      );
      for (const [saleItemId, quantity] of requested) {
        const saleItem = saleItems.find((item) => item.id === saleItemId);
        if (!saleItem) throw new NotFoundException('صنف الفاتورة غير موجود');
        const remaining = Math.max(
          0,
          Number((Number(saleItem.quantity) - (alreadyReturned.get(saleItemId) || 0)).toFixed(4))
        );
        if (quantity > remaining) {
          throw new BadRequestException('الكمية المسترجعة تتجاوز الكمية المتبقية من الصنف');
        }
      }

      // خصم الفاتورة الإجمالي (خصم الكاشير) مش متوزع على الأصناف؛ بنوزعه بالنسبة
      // على قيمة كل صنف قبل الضريبة، عشان المرتجع ميردّش للعميل أكتر من اللي دفعه.
      const saleSubtotal = Number(sale.subtotal || 0);
      const saleDiscount = Math.min(Math.max(Number(sale.discountAmount || 0), 0), saleSubtotal);
      const invoiceDiscountFactor =
        saleSubtotal > 0 ? (saleSubtotal - saleDiscount) / saleSubtotal : 1;

      let subtotal = 0;
      let taxAmount = 0;
      let cogsAdjustment = 0;
      const itemsToSave: Partial<SaleReturnItem>[] = [];
      for (const [saleItemId, quantity] of requested) {
        const saleItem = saleItems.find((item) => item.id === saleItemId)!;
        const product = await manager.findOne(Product, {
          where: { id: saleItem.productId, tenantId, deletedAt: IsNull() },
        });
        if (!product) throw new NotFoundException('المنتج المرتجع غير موجود في هذا التاجر');

        const originalQuantity = Number(saleItem.quantity);
        const originalUnitPrice = Number(saleItem.unitPrice);
        const discountPerUnit =
          originalQuantity > 0 ? Number(saleItem.discountAmount || 0) / originalQuantity : 0;
        const lineUnitPrice = Math.max(0, originalUnitPrice - discountPerUnit);
        const effectiveUnitPrice = lineUnitPrice * invoiceDiscountFactor;
        const lineSubtotal = effectiveUnitPrice * quantity;
        const taxRate = Number(saleItem.taxRate || 0);
        // الضريبة في الفاتورة اتحسبت على قيمة الصنف قبل خصم الفاتورة؛ نرجّعها بنفس الطريقة.
        const lineTax = (lineUnitPrice * quantity * taxRate) / 100;
        const lineTotal = lineSubtotal + lineTax;
        const unitCost = Number(saleItem.unitCost || 0);
        subtotal += lineSubtotal;
        taxAmount += lineTax;
        cogsAdjustment += unitCost * quantity;
        itemsToSave.push({
          tenantId,
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          quantity,
          unitPrice: effectiveUnitPrice,
          taxRate,
          taxAmount: lineTax,
          total: lineTotal,
          unitCost,
          disposition: 'pending',
        });

        // Returned stock is reserved until a user inspects and chooses its disposition.
        if (product.trackInventory) {
          await this.inventoryService.adjustInventoryInTransaction(manager, {
            tenantId,
            productId: product.id,
            warehouseId: sale.warehouseId,
            quantity,
            type: 'return_in',
            referenceType: 'sale_return',
            referenceId: sale.id,
            userId,
          });
          await this.inventoryService.adjustReservedQuantityInTransaction(manager, {
            tenantId,
            productId: product.id,
            warehouseId: sale.warehouseId,
            quantity,
          });
        }
      }

      // المرتجعات السابقة على نفس الفاتورة (قبل حفظ المرتجع الحالي).
      const [previous] = await manager.query(
        `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(invoice_credit), 0) AS credited
         FROM sale_returns WHERE tenant_id = $1 AND original_sale_id = $2`,
        [tenantId, sale.id]
      );
      const round = (value: number) => Math.round(value * 10000) / 10000;
      // لا يتجاوز إجمالي المرتجعات قيمة الفاتورة (فروق التقريب).
      const total = round(
        Math.max(0, Math.min(subtotal + taxAmount, Number(sale.total) - Number(previous.total)))
      );
      if (total < subtotal + taxAmount) taxAmount = Math.max(0, total - subtotal);

      // رصيد العميل المتاح (إجمالي وفي فرع الفاتورة): رصيد العميل مينفعش يبقى سالب،
      // ولو العميل سدد حسابه من «تحصيل» الفاتورة بتفضل غير مدفوعة بس رصيده صفر.
      let availableBalance = Number.POSITIVE_INFINITY;
      if (sale.customerId) {
        const branchId = await resolveTenantBranch(manager, tenantId, sale.branchId);
        const [balances] = await manager.query(
          `SELECT c.balance AS total,
                  (SELECT b.balance FROM branch_party_balances b
                   WHERE b.tenant_id = c.tenant_id AND b.branch_id = $3
                     AND b.party_type = 'customer' AND b.party_id = c.id) AS branch
           FROM customers c WHERE c.id = $1 AND c.tenant_id = $2`,
          [sale.customerId, tenantId, branchId || null]
        );
        availableBalance = Math.max(
          0,
          Math.min(
            Number(balances?.total || 0),
            branchId ? Number(balances?.branch || 0) : Number.POSITIVE_INFINITY
          )
        );
      }

      // 1) الجزء الآجل: بيتخصم من المتبقي على الفاتورة (ومن رصيد العميل).
      const outstanding = sale.customerId
        ? Math.max(0, Number(sale.total) - Number(sale.paidAmount) - Number(previous.credited))
        : 0;
      const invoiceCredit = round(Math.min(total, outstanding, availableBalance));
      // 2) الجزء المدفوع: يتخصم من مديونية العميل على فواتير تانية (لو اختار التاجر
      //    كده وعليه فلوس)، والباقي يترد له فلوس بطريقة الدفع المختارة.
      const paidPortion = round(total - invoiceCredit);
      const refundMode = dto.refundMode || 'refund';
      if (refundMode === 'account' && paidPortion > 0 && !sale.customerId) {
        throw new BadRequestException(
          'الفاتورة مش على عميل؛ لازم المبلغ المدفوع يترد للعميل (نقدي/كارت/تحويل)'
        );
      }
      const accountCredit =
        refundMode === 'account'
          ? round(Math.min(paidPortion, Math.max(0, availableBalance - invoiceCredit)))
          : 0;
      const refundPaid = round(paidPortion - accountCredit);
      const refundMethodId =
        refundPaid > 0
          ? await this.resolveRefundMethod(manager, tenantId, sale.id, dto.refundMethodId)
          : undefined;

      const year = await tenantYear(manager, tenantId);
      const [counter] = await manager.query(
        `INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
         VALUES ($1, 'return', $2, 2)
         ON CONFLICT (tenant_id, document_type, document_year)
         DO UPDATE SET next_value = document_counters.next_value + 1
         RETURNING next_value - 1 AS value`,
        [tenantId, year]
      );
      const returnNumber = `RET-${year}-${String(Number(counter.value)).padStart(4, '0')}`;
      const savedReturn = await manager.save(
        manager.create(SaleReturn, {
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
          invoiceCredit,
          refundPaid,
          accountCredit,
          refundMethodId,
          cogsAdjustment,
          reason: dto.reason?.trim(),
          createdBy: userId,
        })
      );
      for (const item of itemsToSave) {
        await manager.save(manager.create(SaleReturnItem, { ...item, returnId: savedReturn.id }));
      }

      // رصيد العميل بينزل بالجزء الآجل + أي مبلغ اتضاف لحسابه. المبلغ اللي اترد
      // فلوس مش بيأثر على الرصيد (ظاهر في كشف الحساب كمرتجع + مبلغ مردود).
      const balanceReduction = round(invoiceCredit + accountCredit);
      if (sale.customerId && balanceReduction > 0) {
        await this.customersService.adjustBalanceInTransaction(
          manager,
          tenantId,
          sale.customerId,
          -balanceReduction,
          sale.branchId
        );
      }

      const withItems = await manager.findOne(SaleReturn, {
        where: { id: savedReturn.id, tenantId },
        relations: ['items'],
      });
      if (!withItems) throw new NotFoundException('تعذر قراءة المرتجع بعد حفظه');
      return {
        saleReturn: withItems,
        items: Array.from(requested.keys()).map((id) => saleItems.find((item) => item.id === id)!),
      };
    });

    for (const item of returnResult.items) {
      if (item)
        void this.inventoryService.checkLowStock(
          tenantId,
          item.productId,
          returnResult.saleReturn.warehouseId
        );
    }
    const eventData = {
      returnId: returnResult.saleReturn.id,
      returnNumber: returnResult.saleReturn.returnNumber,
      originalSaleId: saleId,
      status: returnResult.saleReturn.status,
      total: Number(returnResult.saleReturn.total),
      itemCount: returnResult.saleReturn.items?.length || 0,
    };
    void this.notifications
      .sendTenantAlert(tenantId, {
        event: 'sale.return.created',
        title: `مرتجع جديد ${returnResult.saleReturn.returnNumber} بانتظار الفحص`,
        details: eventData,
      })
      .catch(() => undefined);
    void this.webhooks.emit(tenantId, 'sale.return.created', eventData);
    return returnResult.saleReturn;
  }

  /**
   * طريقة رد المبلغ المدفوع: المختارة من التاجر، وإلا طريقة دفع الفاتورة الأصلية،
   * وإلا «نقدي». «آجل» مش طريقة رد (الرد على الحساب = refundMode: account).
   */
  private async resolveRefundMethod(
    manager: EntityManager,
    tenantId: string,
    saleId: string,
    requestedMethodId?: string
  ): Promise<string> {
    if (requestedMethodId) {
      const method = await manager.findOne(PaymentMethod, {
        where: { id: requestedMethodId, tenantId, isActive: true },
      });
      if (!method) throw new NotFoundException('طريقة رد المبلغ غير موجودة أو غير نشطة');
      if (method.code === 'credit') {
        throw new BadRequestException('اختار «إضافة لرصيد العميل» بدل طريقة الدفع الآجل');
      }
      return method.id;
    }
    const [fromSale] = await manager.query(
      `SELECT p.payment_method_id AS id
       FROM payments p JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE p.tenant_id = $1 AND p.sale_id = $2 AND pm.code <> 'credit'
       ORDER BY p.amount DESC, p.created_at ASC LIMIT 1`,
      [tenantId, saleId]
    );
    if (fromSale?.id) return fromSale.id;
    const cash = await manager.findOne(PaymentMethod, { where: { tenantId, code: 'cash' } });
    if (cash) return cash.id;
    const any = await manager.findOne(PaymentMethod, {
      where: { tenantId, isActive: true },
      order: { sortOrder: 'ASC' },
    });
    if (!any) throw new BadRequestException('لا توجد طرق دفع معرّفة لرد المبلغ');
    return any.id;
  }

  async findReturns(tenantId: string, status?: string, scope: AccessScope = UNRESTRICTED_SCOPE) {
    const query = this.returnsRepository
      .createQueryBuilder('saleReturn')
      .leftJoinAndSelect('saleReturn.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('saleReturn.originalSale', 'sale')
      .where('saleReturn.tenantId = :tenantId', { tenantId });
    qbIn(query, 'saleReturn.branchId', scope.branchIds, 'scopeBranchIds');
    qbIn(query, 'saleReturn.warehouseId', scope.warehouseIds, 'scopeWarehouseIds');
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
    // صيانة المرتجع بتتسجل فاتورة صيانة داخلية لو ميزة الصيانة مفعّلة (عشان تظهر في
    // «إدارة الصيانة» وتقاريرها)، وإلا بتتسجل مصروف زي الهالك.
    const maintenanceEnabled = await this.featuresService.tenantHasFeature(
      tenantId,
      'maintenance_management'
    );
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
        throw new BadRequestException('تكلفة الصيانة غير صالحة');
      }
      const wasteInput = Number(dto.wasteExpense || 0);
      if (!Number.isFinite(wasteInput) || wasteInput < 0) {
        throw new BadRequestException('قيمة الهالك غير صالحة');
      }
      let writeDown = 0;
      const branchId = await resolveTenantBranch(manager, tenantId, saleReturn.branchId);

      if (originalProduct.trackInventory) {
        // الكمية المرتجعة دخلت المخزن على الصنف الأصلي وهي «محجوزة» لحد الفحص.
        await this.inventoryService.adjustReservedQuantityInTransaction(manager, {
          tenantId,
          productId: originalProduct.id,
          warehouseId: saleReturn.warehouseId,
          quantity: -quantity,
        });
      }
      // «رجوع على نفس الصنف»: فك الحجز كفاية — الكمية بقت متاحة للبيع تاني بنفس التكلفة.
      if (originalProduct.trackInventory && dto.disposition !== 'original') {
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
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_active = true`,
          [dto.supplierId, tenantId]
        );
        if (!supplier) throw new NotFoundException('المورد غير موجود أو غير نشط');
        await this.suppliersService.adjustBalanceInTransaction(
          manager,
          tenantId,
          dto.supplierId,
          -supplierCredit,
          branchId
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
      } else if (dto.disposition === 'original') {
        item.disposition = 'original';
        if (originalProduct.trackInventory && quantity > 0) {
          // الكمية دخلت وقت المرتجع بمتوسط التكلفة الحالي؛ نصحح المتوسط عشان الكمية
          // ترجع بتكلفتها الأصلية (نفس القيمة اللي اتعكست من تكلفة المبيعات).
          await manager.query(
            `UPDATE inventory
             SET weighted_avg_cost = GREATEST(0,
                   weighted_avg_cost + ($4::numeric * ($5::numeric - weighted_avg_cost)) / quantity)
             WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3 AND quantity >= $4`,
            [tenantId, originalProduct.id, saleReturn.warehouseId, quantity, originalUnitCost]
          );
        }
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
        // لو الصنف رجع المخزن بتكلفة أقل من تكلفته الأصلية، الفرق خسارة فعلية
        // (هالك/فرق تقييم) لازم تظهر في الأرباح.
        writeDown = Math.max(0, (originalUnitCost - Number(newProduct.costPrice)) * quantity);
        writeDown = Math.round(writeDown * 10000) / 10000;
      }

      const wasteExpense = wasteInput + writeDown;
      item.repairExpense = repairExpense;
      item.wasteExpense = wasteExpense;
      await manager.save(item);

      let maintenanceInvoiceId: string | undefined;
      if (repairExpense > 0) {
        if (maintenanceEnabled) {
          maintenanceInvoiceId = await this.createReturnedItemMaintenance(manager, {
            tenantId,
            userId,
            branchId,
            saleReturn,
            itemId: item.id,
            productName: originalProduct.name,
            amount: repairExpense,
            description: dto.repairDescription,
          });
        } else {
          await this.createReturnedItemExpense(
            manager,
            tenantId,
            userId,
            branchId,
            saleReturn.returnNumber,
            `${item.id.slice(0, 8)}-R`,
            `تكلفة صيانة للصنف المرتجع: ${originalProduct.name}`,
            repairExpense
          );
        }
      }
      if (wasteExpense > 0) {
        const parts = [
          wasteInput > 0 ? `هالك ${wasteInput}` : '',
          writeDown > 0 ? `فرق تقييم ${writeDown} (التكلفة الجديدة أقل من الأصلية)` : '',
        ].filter(Boolean);
        await this.createReturnedItemExpense(
          manager,
          tenantId,
          userId,
          branchId,
          saleReturn.returnNumber,
          `${item.id.slice(0, 8)}-W`,
          `هالك للصنف المرتجع: ${originalProduct.name} — ${parts.join('، ')}`,
          wasteExpense
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
        wasteExpense,
        writeDown,
        maintenanceInvoiceId,
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

  /**
   * مصروف داخلي للمرتجع (هالك/فرق تقييم، أو صيانة لو ميزة الصيانة مش مفعّلة).
   * مش مصروف نقدي من الدرج — notes بتبدأ بـ «مرتجع البيع» وmetadata.nonCash.
   */
  private async createReturnedItemExpense(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    branchId: string | undefined,
    returnNumber: string,
    key: string,
    description: string,
    amount: number
  ) {
    const [category] = await manager.query(
      `INSERT INTO expense_categories (tenant_id, name, name_ar, is_active)
       VALUES ($1, 'Returned goods repair and waste', 'صيانة وهالك المرتجعات', true)
       ON CONFLICT (tenant_id, name) DO UPDATE SET is_active = true
       RETURNING id`,
      [tenantId]
    );
    const expenseNumber = `EXP-RET-${returnNumber}-${key}`;
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
        description,
        `مرتجع البيع رقم ${returnNumber}`,
        userId,
      ]
    );
  }

  /**
   * صيانة صنف مرتجع = فاتورة صيانة داخلية: سعر الخدمة صفر وتكلفة القطع = تكلفة
   * الصيانة، فربحها بالسالب. بتظهر في «إدارة الصيانة» وتقارير الصيانة والفروع
   * (ومش بتتسجل مصروف كمان عشان متتحسبش مرتين).
   */
  private async createReturnedItemMaintenance(
    manager: EntityManager,
    input: {
      tenantId: string;
      userId: string;
      branchId?: string;
      saleReturn: SaleReturn;
      itemId: string;
      productName: string;
      amount: number;
      description?: string;
    }
  ): Promise<string> {
    const { tenantId, saleReturn } = input;
    // نفس قفل وترقيم فواتير الصيانة في MaintenanceService.
    await manager.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
    const [{ count }] = await manager.query(
      'SELECT COUNT(*)::int AS count FROM maintenance_invoices WHERE tenant_id = $1',
      [tenantId]
    );
    const invoiceNumber = `MNT-${await tenantYear(manager, tenantId)}-${String(Number(count) + 1).padStart(5, '0')}`;
    let customerName = 'صيانة داخلية — مرتجع';
    let customerPhone: string | null = null;
    if (saleReturn.customerId) {
      const [customer] = await manager.query(
        'SELECT name, phone FROM customers WHERE id = $1 AND tenant_id = $2',
        [saleReturn.customerId, tenantId]
      );
      if (customer?.name) customerName = customer.name;
      customerPhone = customer?.phone || null;
    }
    const [row] = await manager.query(
      `INSERT INTO maintenance_invoices
         (tenant_id, branch_id, invoice_number, customer_id, customer_name, customer_phone,
          product_name, product_notes, maintenance_description, parts_cost, service_price,
          status, maintenance_date, created_by, source, sale_return_id, sale_return_item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'completed', CURRENT_TIMESTAMP, $11,
               'sale_return', $12, $13)
       RETURNING id`,
      [
        tenantId,
        input.branchId || null,
        invoiceNumber,
        saleReturn.customerId || null,
        customerName,
        customerPhone,
        input.productName,
        `صنف مرتجع — مرتجع رقم ${saleReturn.returnNumber}`,
        input.description?.trim() || `صيانة صنف مرتجع (${saleReturn.returnNumber})`,
        input.amount,
        input.userId,
        saleReturn.id,
        input.itemId,
      ]
    );
    return row.id;
  }
}
