import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('keeps configured global destinations and sends the merchant a separate copy', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          NOTIFICATION_EMAIL_TO: 'blinkbusinessdevelopment@gmail.com',
          WHATSAPP_TO: '+201024898091',
        };
        return values[key];
      }),
    };
    const service = new NotificationsService(config as any);
    const email = jest.spyOn(service as any, 'sendEmail').mockResolvedValue('sent');
    const whatsapp = jest.spyOn(service as any, 'sendWhatsApp').mockResolvedValue('sent');

    const result = await service.sendOperationalAlert(
      {
        event: 'supplier.payables_limit_exceeded',
        title: 'تجاوز حد مستحقات الموردين',
        details: { إجمالي_المستحق: 1500, الحد: 1000 },
      },
      { email: 'merchant@example.com', whatsapp: '+201011111111' }
    );

    expect(result).toEqual({ email: 'sent', whatsapp: 'sent' });
    // كل طرف بيستلم رسالته لوحده (التاجر ما يشوفش إيميل إدارة النظام).
    expect(email).toHaveBeenCalledTimes(2);
    expect(email).toHaveBeenCalledWith(
      'تجاوز حد مستحقات الموردين',
      expect.stringContaining('إجمالي_المستحق: 1500'),
      ['blinkbusinessdevelopment@gmail.com']
    );
    expect(email).toHaveBeenCalledWith(
      'تجاوز حد مستحقات الموردين',
      expect.stringContaining('إجمالي_المستحق: 1500'),
      ['merchant@example.com']
    );
    expect(whatsapp).toHaveBeenCalledWith(expect.stringContaining('الحد: 1000'), [
      '+201024898091',
      '+201011111111',
    ]);
  });

  it('sends tenant alerts to the merchant contacts only when the alert type is enabled', async () => {
    const config = { get: jest.fn(() => undefined) };
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          businessName: 'متجر تجريبي',
          timezone: 'Asia/Riyadh',
          alertEmail: 'shop@example.com',
          alertWhatsapp: '+966500000000',
          accountEmail: 'owner@example.com',
          accountPhone: null,
          alertEvents: { low_stock: false },
        },
      ]),
    };
    const service = new NotificationsService(config as any, dataSource as any);
    const email = jest.spyOn(service as any, 'sendEmail').mockResolvedValue('sent');
    const whatsapp = jest.spyOn(service as any, 'sendWhatsApp').mockResolvedValue('sent');

    await service.sendTenantAlert('tenant-1', {
      event: 'sale.created',
      title: 'فاتورة بيع جديدة',
      details: { saleId: 'x', saleNumber: 'INV-1', total: 100, paymentStatus: 'paid' },
    });
    expect(email).toHaveBeenCalledWith('فاتورة بيع جديدة', expect.any(String), [
      'shop@example.com',
    ]);
    const merchantMessage = email.mock.calls.find((call) =>
      (call[2] as string[]).includes('shop@example.com')
    )![1] as string;
    expect(merchantMessage).toContain('متجر تجريبي');
    expect(merchantMessage).toContain('رقم الفاتورة: INV-1');
    expect(merchantMessage).toContain('حالة الدفع: مدفوع');
    expect(merchantMessage).not.toContain('saleId');
    expect(whatsapp).toHaveBeenCalledWith(expect.any(String), ['+966500000000']);

    email.mockClear();
    whatsapp.mockClear();
    await service.sendTenantAlert('tenant-1', {
      event: 'inventory.low_stock',
      title: 'انخفاض مخزون',
      details: { productName: 'صنف' },
    });
    // نوع التنبيه مقفول عند التاجر: بيوصل لإدارة النظام بس.
    expect(email).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), [
      'shop@example.com',
    ]);
    expect(whatsapp).not.toHaveBeenCalledWith(expect.anything(), ['+966500000000']);
  });
});
