import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
  async create(tenantId: string, dto: CreateSaleDto, userId: string): Promise<Sale> {
    return this.dataSource.transaction(async (manager) => {
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
          await this.inventoryService.adjustInventory({
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
            paymentNumber: `PAY-${savedSale.saleNumber}-${Math.random().toString(36).slice(2, 6)}`,
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
        await this.customersService.adjustBalance(tenantId, dto.customerId, total - paidAmount);
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
    const sale = await this.findById(tenantId, saleId);

    const payment = this.paymentsRepository.create({
      tenantId,
      paymentNumber: `PAY-${sale.saleNumber}-${Math.random().toString(36).slice(2, 6)}`,
      saleId,
      customerId: sale.customerId,
      paymentMethodId: methodId,
      amount,
      paymentDate: new Date(),
      referenceNumber,
      createdBy: userId,
    });
    await this.paymentsRepository.save(payment);

    sale.paidAmount = Number(sale.paidAmount) + amount;
    sale.paymentStatus = sale.paidAmount >= sale.total ? 'paid' : 'partial';
    await this.salesRepository.save(sale);

    if (sale.customerId) {
      await this.customersService.adjustBalance(tenantId, sale.customerId, -amount);
    }

    return { payment, sale };
  }

  async voidSale(tenantId: string, id: string, reason: string, userId: string): Promise<void> {
    const sale = await this.findById(tenantId, id);
    if (Number(sale.paidAmount) > 0) {
      throw new BadRequestException('لا يمكن إلغاء فاتورة تم الدفع عليها');
    }

    // Restore stock for tracked items
    for (const item of sale.items) {
      await this.inventoryService.adjustInventory({
        tenantId,
        productId: item.productId,
        warehouseId: sale.warehouseId,
        quantity: item.quantity,
        type: 'return_in',
        referenceType: 'sale_void',
        referenceId: sale.id,
        userId,
      });
    }

    sale.status = 'cancelled';
    sale.voidedAt = new Date();
    sale.voidedBy = userId;
    sale.voidReason = reason;
    await this.salesRepository.save(sale);
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
      });
      if (!sale) throw new NotFoundException('الفاتورة غير موجودة');

      let subtotal = 0;
      let taxAmount = 0;
      let cogsAdjustment = 0;
      const itemsToSave: Partial<SaleReturnItem>[] = [];

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

        // إرجاع الكمية للمخزون
        await this.inventoryService.adjustInventory({
          tenantId,
          productId: saleItem.productId,
          warehouseId: sale.warehouseId,
          quantity: input.quantity,
          type: 'return_in',
          referenceType: 'sale_return',
          referenceId: sale.id,
          userId,
        });
      }

      const total = subtotal + taxAmount;
      const count = await manager.count(SaleReturn, { where: { tenantId } });
      const returnNumber = `RET-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

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

      // تعديل رصيد العميل: لو الفاتورة كانت عليها مبلغ مستحق، ننزّله؛ غير كده يُسجَّل كمسترد نقدي
      if (sale.customerId) {
        await this.customersService.adjustBalance(tenantId, sale.customerId, -total);
      }

      // خصم قيمة المرتجع من إجمالي الفاتورة الأصلية حتى يعكس تقرير الأرباح الواقع الفعلي
      sale.total = Number(sale.total) - total;
      sale.cogs = Number(sale.cogs) - cogsAdjustment;
      await manager.save(sale);

      return savedReturn;
    });
  }
}
