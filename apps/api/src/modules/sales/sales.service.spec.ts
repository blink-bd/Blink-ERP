import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { SaleReturn } from './entities/sale-return.entity';
import { SaleReturnItem } from './entities/sale-return-item.entity';
import { ProductsService } from '@/modules/products/products.service';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { CustomersService } from '@/modules/customers/customers.service';
import { FeaturesService } from '@/modules/features/features.service';
import { Product } from '@/modules/products/entities/product.entity';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WebhooksService } from '@/modules/integrations/webhooks.service';
import { ConfigService } from '@nestjs/config';

describe('SalesService - createReturn', () => {
  let service: SalesService;
  let mockManager: any;
  let mockDataSource: any;
  let mockSalesRepo: any;
  let mockSaleItemsRepo: any;
  let mockPaymentsRepo: any;
  let mockPaymentMethodsRepo: any;
  let mockReturnsRepo: any;
  let mockReturnItemsRepo: any;
  let mockProductsService: any;
  let mockInventoryService: any;
  let mockCustomersService: any;
  let mockFeaturesService: any;

  const tenantId = 'tenant-123';
  const userId = 'user-123';
  const saleId = 'sale-123';

  beforeEach(async () => {
    mockManager = {
      findOne: jest.fn(),
      // createReturn/voidSale يقرآن أصناف الفاتورة بعد قفل رأس الفاتورة بدون relations
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM sale_return_items')) return [];
        if (sql.includes('INSERT INTO document_counters')) return [{ value: 1 }];
        if (sql.includes('FROM sale_returns')) return [{ total: 0 }];
        return [];
      }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((entity, data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve({ id: 'return-saved-id', ...entity })),
      createQueryBuilder: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
      query: jest.fn().mockResolvedValue([]),
    };

    mockSalesRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockSaleItemsRepo = {
      find: jest.fn(),
      save: jest.fn(),
    };

    mockPaymentsRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    mockPaymentMethodsRepo = {
      find: jest.fn(),
    };

    mockReturnsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    };

    mockReturnItemsRepo = {
      createQueryBuilder: jest.fn(),
    };

    mockProductsService = {
      findById: jest.fn(),
    };

    mockInventoryService = {
      getAvailableQuantity: jest.fn(),
      adjustInventory: jest.fn().mockResolvedValue(undefined),
      adjustInventoryInTransaction: jest.fn().mockResolvedValue(undefined),
      adjustReservedQuantityInTransaction: jest.fn().mockResolvedValue(undefined),
      checkLowStock: jest.fn().mockResolvedValue(undefined),
    };

    mockCustomersService = {
      adjustBalance: jest.fn().mockResolvedValue(undefined),
      adjustBalanceInTransaction: jest.fn().mockResolvedValue(undefined),
    };

    mockFeaturesService = {
      tenantHasFeature: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: mockSalesRepo },
        { provide: getRepositoryToken(SaleItem), useValue: mockSaleItemsRepo },
        { provide: getRepositoryToken(Payment), useValue: mockPaymentsRepo },
        { provide: getRepositoryToken(PaymentMethod), useValue: mockPaymentMethodsRepo },
        { provide: getRepositoryToken(SaleReturn), useValue: mockReturnsRepo },
        { provide: getRepositoryToken(SaleReturnItem), useValue: mockReturnItemsRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ProductsService, useValue: mockProductsService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: SuppliersService, useValue: {} },
        {
          provide: NotificationsService,
          useValue: {
            sendOperationalAlert: jest.fn().mockResolvedValue(undefined),
            sendTenantAlert: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: WebhooksService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: FeaturesService, useValue: mockFeaturesService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  const createMockSale = (overrides = {}) => ({
    id: saleId,
    branchId: 'branch-123',
    tenantId,
    saleNumber: 'INV-2026-0001',
    customerId: 'cust-123',
    warehouseId: 'wh-123',
    total: 100,
    subtotal: 100,
    cogs: 60,
    paidAmount: 0,
    paymentStatus: 'pending',
    status: 'completed',
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'جراب شفاف',
        quantity: 5,
        unitPrice: 20,
        taxRate: 0,
        taxAmount: 0,
        subtotal: 100,
        total: 100,
        unitCost: 12,
      },
    ],
    ...overrides,
  });

  const configureReturnTransaction = (sale: any, previousRows: any[] = []) => {
    mockManager.findOne.mockImplementation((entity: any) => {
      if (entity === Sale) return Promise.resolve(sale);
      if (entity === Product) return Promise.resolve({ id: 'prod-1', trackInventory: true });
      if (entity === SaleReturn) {
        return Promise.resolve({
          id: 'return-saved-id',
          returnNumber: 'RET-2026-0001',
          status: 'pending_inspection',
          total: 100,
          warehouseId: sale.warehouseId,
          items: [],
        });
      }
      return Promise.resolve(null);
    });
    mockManager.find.mockImplementation((entity: any) =>
      Promise.resolve(entity === SaleItem ? sale.items || [] : [])
    );
    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM sale_return_items')) return previousRows;
      if (sql.includes('INSERT INTO document_counters')) return [{ value: 1 }];
      if (sql.includes('FROM sale_returns')) return [{ total: 0, credited: 0 }];
      if (sql.includes('FROM branches')) return [{ id: 'branch-123' }];
      if (sql.includes('FROM customers c')) return [{ total: 1000, branch: 1000 }];
      return [];
    });
  };

  it('يمنع استرجاع كمية أكبر من الكمية المتبقية بعد حساب الاسترجاعات السابقة', async () => {
    const sale = createMockSale();
    configureReturnTransaction(sale, [{ saleItemId: 'item-1', returnedQuantity: '3' }]);

    // استرجاع سابق بمقدار 3 قطع

    // محاولة استرجاع 3 قطع بينما المتبقي 2 فقط (5 - 3 = 2)
    await expect(
      service.createReturn(tenantId, saleId, { items: [{ saleItemId: 'item-1', quantity: 3 }] }, userId)
    ).rejects.toThrow(BadRequestException);
  });

  it('يمنع استرجاع الصنف أكثر من مرة بعد استرجاع كامل الكمية', async () => {
    const sale = createMockSale();
    configureReturnTransaction(sale, [{ saleItemId: 'item-1', returnedQuantity: '5' }]);

    // استرجاع سابق لكامل الكمية (5 قطع)

    await expect(
      service.createReturn(tenantId, saleId, { items: [{ saleItemId: 'item-1', quantity: 1 }] }, userId)
    ).rejects.toThrow(BadRequestException);
  });

  it('records a full return without mutating the original invoice and applies the unpaid balance in its branch', async () => {
    const sale = createMockSale({ total: 100, cogs: 60 });
    configureReturnTransaction(sale);

    const result = await service.createReturn(
      tenantId,
      saleId,
      { items: [{ saleItemId: 'item-1', quantity: 5 }] },
      userId
    );

    expect(result).toBeDefined();
    expect(result.total).toBe(100);
    // فاتورة آجلة: القيمة كلها بتتخصم من المتبقي عليها، ومفيش مبلغ مردود
    expect(mockManager.create).toHaveBeenCalledWith(
      SaleReturn,
      expect.objectContaining({ total: 100, invoiceCredit: 100, refundPaid: 0, accountCredit: 0 })
    );
    expect(sale.total).toBe(100);
    expect(sale.cogs).toBe(60);
    expect(sale.status).toBe('completed');
    expect(mockCustomersService.adjustBalanceInTransaction).toHaveBeenCalledWith(
      mockManager,
      tenantId,
      'cust-123',
      -100,
      'branch-123'
    );
    expect(mockInventoryService.adjustInventoryInTransaction).toHaveBeenCalledWith(
      mockManager,
      {
        tenantId,
        productId: 'prod-1',
        warehouseId: 'wh-123',
        quantity: 5,
        type: 'return_in',
        referenceType: 'sale_return',
        referenceId: saleId,
        userId,
      }
    );
    expect(mockInventoryService.adjustReservedQuantityInTransaction).toHaveBeenCalledWith(
      mockManager,
      { tenantId, productId: 'prod-1', warehouseId: 'wh-123', quantity: 5 }
    );
  });

  it('يمنع الاسترجاع من فاتورة ملغاة', async () => {
    const sale = createMockSale({ status: 'cancelled' });
    configureReturnTransaction(sale);

    await expect(
      service.createReturn(tenantId, saleId, { items: [{ saleItemId: 'item-1', quantity: 1 }] }, userId)
    ).rejects.toThrow(BadRequestException);
  });

  it('يحسب الكمية المتبقية والمسترجعة بدقة عند الاستعلام بـ findById', async () => {
    const sale = createMockSale();
    mockSalesRepo.findOne.mockResolvedValue(sale);

    mockReturnItemsRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { saleItemId: 'item-1', returnedQuantity: '2' },
      ]),
    });

    const result = await service.findById(tenantId, saleId);
    expect(result.items[0].returnedQuantity).toBe(2);
    expect(result.items[0].remainingQuantity).toBe(3);
  });
});
