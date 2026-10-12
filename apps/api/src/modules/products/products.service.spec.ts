import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

/**
 * اختبارات وحدة مركّزة على منطق التسعير الحرج:
 * - منع حفظ أي سعر (قطاعي/جملة/نصف جملة) أقل من أو يساوي سعر التكلفة.
 * - منع تعديل/إضافة سعر نصف الجملة إذا كانت ميزة half_wholesale_pricing
 *   غير مفعّلة للتاجر، حتى لو كان الطلب جاي مباشرة على الـ API.
 * - توليد باركود EAN-13 صالح (checksum صحيح) وغير مكرر.
 */
describe('ProductsService', () => {
  const buildService = (overrides: Partial<any> = {}) => {
    const productsRepository = {
      createQueryBuilder: jest.fn(),
      ...overrides.productsRepository,
    };
    const inventoryService = {} as any;
    const warehousesService = {} as any;
    const featuresService = {
      tenantHasFeature: jest.fn().mockResolvedValue(true),
      ...overrides.featuresService,
    };
    const service = new ProductsService(
      productsRepository as any,
      inventoryService,
      warehousesService,
      featuresService as any
    );
    return { service, productsRepository, featuresService };
  };

  describe('validateSellingPrices (via private access)', () => {
    it('throws if selling (retail) price <= cost price', () => {
      const { service } = buildService();
      expect(() => (service as any).validateSellingPrices(20, 20)).toThrow(BadRequestException);
      expect(() => (service as any).validateSellingPrices(20, 15)).toThrow(BadRequestException);
    });

    it('throws if wholesale price <= cost price', () => {
      const { service } = buildService();
      expect(() => (service as any).validateSellingPrices(10, 25, 10)).toThrow(BadRequestException);
    });

    it('throws if half-wholesale price <= cost price', () => {
      const { service } = buildService();
      expect(() => (service as any).validateSellingPrices(10, 25, 18, 10)).toThrow(
        BadRequestException
      );
      expect(() => (service as any).validateSellingPrices(10, 25, 18, 9)).toThrow(
        BadRequestException
      );
    });

    it('passes when every tier is strictly above the cost price', () => {
      const { service } = buildService();
      expect(() => (service as any).validateSellingPrices(10, 25, 18, 15)).not.toThrow();
    });
  });

  describe('assertHalfWholesaleAllowed', () => {
    it('does nothing when value is undefined/null', async () => {
      const { service, featuresService } = buildService();
      await (service as any).assertHalfWholesaleAllowed('tenant-1', undefined);
      await (service as any).assertHalfWholesaleAllowed('tenant-1', null);
      expect(featuresService.tenantHasFeature).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the feature is disabled for the tenant', async () => {
      const { service, featuresService } = buildService({
        featuresService: { tenantHasFeature: jest.fn().mockResolvedValue(false) },
      });
      await expect(
        (service as any).assertHalfWholesaleAllowed('tenant-1', 15)
      ).rejects.toThrow(BadRequestException);
      expect(featuresService.tenantHasFeature).toHaveBeenCalledWith(
        'tenant-1',
        'half_wholesale_pricing'
      );
    });

    it('resolves silently when the feature is enabled for the tenant', async () => {
      const { service } = buildService();
      await expect(
        (service as any).assertHalfWholesaleAllowed('tenant-1', 15)
      ).resolves.toBeUndefined();
    });
  });

  describe('generateUniqueBarcode', () => {
    it('generates a 13-digit numeric EAN-13 barcode with a valid checksum', async () => {
      const getOne = jest.fn().mockResolvedValue(null); // no collision
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne,
      };
      const { service } = buildService({
        productsRepository: { createQueryBuilder: jest.fn().mockReturnValue(qb) },
      });

      const barcode = await service.generateUniqueBarcode('tenant-1');

      expect(barcode).toHaveLength(13);
      expect(/^\d{13}$/.test(barcode)).toBe(true);
      expect(barcode.startsWith('200')).toBe(true); // GS1 in-store-use prefix

      const digits = barcode.split('').map(Number);
      const sum = digits
        .slice(0, 12)
        .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
      const expectedCheckDigit = (10 - (sum % 10)) % 10;
      expect(digits[12]).toBe(expectedCheckDigit);
    });

    it('retries until it finds a non-colliding barcode', async () => {
      const getOne = jest
        .fn()
        .mockResolvedValueOnce({ id: 'existing-product' }) // first candidate collides
        .mockResolvedValueOnce(null); // second candidate is free
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne,
      };
      const { service } = buildService({
        productsRepository: { createQueryBuilder: jest.fn().mockReturnValue(qb) },
      });

      const barcode = await service.generateUniqueBarcode('tenant-1');
      expect(getOne).toHaveBeenCalledTimes(2);
      expect(/^\d{13}$/.test(barcode)).toBe(true);
    });

    it('throws if it cannot find a unique barcode after the max attempts', async () => {
      const getOne = jest.fn().mockResolvedValue({ id: 'always-collides' });
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne,
      };
      const { service } = buildService({
        productsRepository: { createQueryBuilder: jest.fn().mockReturnValue(qb) },
      });

      await expect(service.generateUniqueBarcode('tenant-1')).rejects.toThrow(
        BadRequestException
      );
    });
  });
});
