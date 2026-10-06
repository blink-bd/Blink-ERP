import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { Inventory } from './entities/inventory.entity';
import { InventoryTransaction } from './entities/inventory-transaction.entity';

describe('InventoryService', () => {
  let service: InventoryService;

  const createQueryBuilderMock = (rows: any[]) => {
    const qb: any = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  const inventoryRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  };

  const transactionsRepository = {
    createQueryBuilder: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(Inventory), useValue: inventoryRepository },
        { provide: getRepositoryToken(InventoryTransaction), useValue: transactionsRepository },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  describe('getSummary', () => {
    it('uses INNER joins for product and warehouse so orphaned inventory rows are excluded', async () => {
      const qb = createQueryBuilderMock([]);
      inventoryRepository.createQueryBuilder.mockReturnValue(qb);

      await service.getSummary('tenant-1');

      // المنتج والمخزن يجب أن يكونا INNER JOIN (مع تقييد نفس الـtenant)
      // حتى لا تُرجع سجلات مخزون يتيمة بعد الحذف المنطقي.
      expect(qb.innerJoinAndSelect).toHaveBeenCalledWith(
        'inv.product',
        'product',
        'product.tenantId = :tenantId',
        { tenantId: 'tenant-1' }
      );
      expect(qb.innerJoinAndSelect).toHaveBeenCalledWith(
        'inv.warehouse',
        'warehouse',
        'warehouse.tenantId = :tenantId',
        { tenantId: 'tenant-1' }
      );

      // الصنف يبقى LEFT JOIN لأنه اختياري.
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('product.category', 'category');

      // لا يجوز استخدام LEFT JOIN للمنتج أو المخزن.
      const leftJoinTargets = qb.leftJoinAndSelect.mock.calls.map((call: any[]) => call[0]);
      expect(leftJoinTargets).not.toContain('inv.product');
      expect(leftJoinTargets).not.toContain('inv.warehouse');
    });

    it('keeps stockValue a valid finite number when costs are missing', async () => {
      const qb = createQueryBuilderMock([
        {
          id: 'row-1',
          quantity: '5',
          availableQuantity: '5',
          weightedAvgCost: null,
          product: { name: 'كابل شحن', costPrice: undefined, minStockLevel: null },
          warehouse: { name: 'المخزن الرئيسي' },
        },
        {
          id: 'row-2',
          quantity: 'not-a-number',
          availableQuantity: null,
          weightedAvgCost: undefined,
          product: { name: 'شاحن', costPrice: 'oops' },
          warehouse: { name: 'المخزن الرئيسي' },
        },
      ]);
      inventoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getSummary('tenant-1');

      expect(result).toHaveLength(2);
      for (const row of result) {
        expect(typeof row.stockValue).toBe('number');
        expect(Number.isFinite(row.stockValue)).toBe(true);
        expect(Number.isNaN(row.stockValue)).toBe(false);
      }
      expect(result[0].stockValue).toBe(0);
      expect(result[1].stockValue).toBe(0);
    });

    it('computes stockValue from weighted average cost when available', async () => {
      const qb = createQueryBuilderMock([
        {
          id: 'row-1',
          quantity: '4',
          availableQuantity: '4',
          weightedAvgCost: '2.5',
          product: { name: 'سماعة', costPrice: '99', minStockLevel: 1 },
          warehouse: { name: 'المخزن الرئيسي' },
        },
      ]);
      inventoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getSummary('tenant-1');

      expect(result[0].stockValue).toBe(10);
      expect(result[0].status).toBe('available');
    });
  });
});
