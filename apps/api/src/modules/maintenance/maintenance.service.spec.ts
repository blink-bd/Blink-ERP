import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  buildMaintenanceShareMessage,
  maintenanceAmount,
  MaintenanceService,
  MaintenanceShareInput,
} from './maintenance.service';

const base: MaintenanceShareInput = {
  customerName: 'أحمد محمد',
  businessName: 'متجر الإكسسوارات',
  invoiceNumber: 'MNT-2026-00001',
  dateLabel: '14/10/2026',
  productName: 'iPhone 13',
  productModel: 'A2633',
  productSerial: '356789012345678',
  maintenanceDescription: 'تغيير شاشة أصلية',
  servicePrice: 350,
  currency: 'EGP',
};

/** الصفوف اللي بيرجعها استعلام getShareInfo (مالهاش علاقة بـ jest). */
const shareRow = {
  invoiceNumber: 'MNT-2026-00001',
  date: new Date('2026-10-14T10:00:00Z'),
  customerName: 'أحمد محمد',
  customerPhone: '01012345678',
  productName: 'iPhone 13',
  productModel: 'A2633',
  productSerial: '356789012345678',
  maintenanceDescription: 'تغيير شاشة أصلية',
  servicePrice: '350',
  source: 'manual',
  currency: 'EGP',
  timezone: 'Africa/Cairo',
  country: 'Egypt',
  businessName: 'متجر الإكسسوارات',
};

const buildService = (rows: unknown[]) => {
  const dataSource = { query: jest.fn(async () => rows) };
  const service = new MaintenanceService({} as never, dataSource as never);
  return { service, dataSource };
};

describe('رسالة واتساب لفاتورة الصيانة', () => {
  it('بيكتب إيراد الخدمة بمسمى «تكلفة الصيانة»', () => {
    const message = buildMaintenanceShareMessage(base);
    expect(message).toContain('تكلفة الصيانة: 350 ج.م');
  });

  it('مافيهاش أي مبلغ تاني غير تكلفة الصيانة (تكلفة القطع والربح مش بتتبعت)', () => {
    const message = buildMaintenanceShareMessage({ ...base, servicePrice: 350 });
    const amountLines = message.split('\n').filter((line) => line.includes('ج.م'));
    expect(amountLines).toEqual(['تكلفة الصيانة: 350 ج.م']);
    expect(message).not.toMatch(/الربح|تكلفة القطع|قطع غيار/);
  });

  it('بتفاصيل الشغل: العميل ورقم الفاتورة والجهاز ووصف الصيانة', () => {
    const message = buildMaintenanceShareMessage(base);
    expect(message).toContain('مرحباً أحمد محمد،');
    expect(message).toContain('MNT-2026-00001');
    expect(message).toContain('iPhone 13');
    expect(message).toContain('IMEI/Serial: 356789012345678');
    expect(message).toContain('تغيير شاشة أصلية');
  });

  it('بينسّق المبلغ حسب عملة التاجر', () => {
    expect(maintenanceAmount(1250.5, 'SAR')).toBe('1,250.5 ر.س');
    expect(buildMaintenanceShareMessage({ ...base, currency: 'SAR' })).toContain(
      'تكلفة الصيانة: 350 ر.س'
    );
  });
});

describe('MaintenanceService.getShareInfo', () => {
  it('بيرجع بيانات الإرسال من غير تكلفة القطع أو الربح', async () => {
    const { service } = buildService([shareRow]);

    const info = await service.getShareInfo('tenant-1', 'invoice-1');

    expect(info.customer.whatsapp).toBe('201012345678');
    expect(info.servicePrice).toBe(350);
    expect(info.message).toContain('تكلفة الصيانة: 350 ج.م');
    // مفيش أي مفتاح لتكلفة القطع أو الربح في الرد أصلاً.
    expect(Object.keys(info)).not.toContain('partsCost');
    expect(Object.keys(info)).not.toContain('profit');
    expect(JSON.stringify(info)).not.toMatch(/partsCost|profit/);
  });

  it('بيرفض إرسال صيانة الأصناف المرتجعة (داخلية من غير إيراد)', async () => {
    const { service } = buildService([{ ...shareRow, source: 'sale_return' }]);
    await expect(service.getShareInfo('tenant-1', 'invoice-1')).rejects.toThrow(BadRequestException);
  });

  it('بيرمي 404 لو الفاتورة مش موجودة', async () => {
    const { service } = buildService([]);
    await expect(service.getShareInfo('tenant-1', 'unknown')).rejects.toThrow(NotFoundException);
  });
});
