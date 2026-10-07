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
      query: jest.fn().mockResolvedValue([{ trackInventory: true }]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((entity, data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve({ id: 'return-saved-id', ...entity })),
      createQueryBuilder: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
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
    };

    mockCustomersService = {
      adjustBalance: jest.fn().mockResolvedValue(undefined),
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
        { provide: FeaturesService, useValue: mockFeaturesService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  const createMockSale = (overrides = {}) => ({
    id: saleId,
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

  it('يمنع استرجاع كمية أكبر من الكمية المتبقية بعد حساب الاسترجاعات السابقة', async () => {
    const sale = createMockSale();
    mockManager.findOne.mockResolvedValue(sale);

    // استرجاع سابق بمقدار 3 قطع
    mockManager.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { saleItemId: 'item-1', returnedQuantity: '3' },
      ]),
    });

    // محاولة استرجاع 3 قطع بينما المتبقي 2 فقط (5 - 3 = 2)
    await expect(
      service.createReturn(tenantId, saleId, { items: [{ saleItemId: 'item-1', quantity: 3 }] }, userId)
    ).rejects.toThrow(BadRequestException);
  });

  it('يمنع استرجاع الصنف أكثر من مرة بعد استرجاع كامل الكمية', async () => {
    const sale = createMockSale();
    mockManager.findOne.mockResolvedValue(sale);

    // استرجاع سابق لكامل الكمية (5 قطع)
    mockManager.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { saleItemId: 'item-1', returnedQuantity: '5' },
      ]),
    });

    await expect(
      service.createReturn(tenantId, saleId, { items: [{ saleItemId: 'item-1', quantity: 1 }] }, userId)
    ).rejects.toThrow(BadRequestException);
  });

  it('يمنع إجمالي الفاتورة من التحول إلى رقم سالب عند استرجاع كامل الفاتورة أو زيادة طفيفة', async () => {
    const sale = createMockSale({ total: 100, cogs: 60 });
    mockManager.findOne.mockResolvedValue(sale);

    mockManager.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    const result = await service.createReturn(
      tenantId,
      saleId,
      { items: [{ saleItemId: 'item-1', quantity: 5 }] },
      userId
    );

    expect(result).toBeDefined();
    expect(sale.total).toBe(0);
    expect(sale.cogs).toBe(0);
    expect(sale.status).toBe('returned');
    expect(mockCustomersService.adjustBalance).toHaveBeenCalledWith(
      tenantId,
      'cust-123',
      -100,
      mockManager
    );
    expect(mockInventoryService.adjustInventory).toHaveBeenCalledWith(
      {
        tenantId,
        productId: 'prod-1',
        warehouseId: 'wh-123',
        quantity: 5,
        type: 'return_in',
        referenceType: 'sale_return',
        referenceId: saleId,
        userId,
      },
      mockManager
    );
  });

  it('يمنع الاسترجاع من فاتورة ملغاة', async () => {
    const sale = createMockSale({ status: 'cancelled' });
    mockManager.findOne.mockResolvedValue(sale);

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
