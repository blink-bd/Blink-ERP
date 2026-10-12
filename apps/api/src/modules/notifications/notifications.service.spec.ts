import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('keeps configured global destinations and includes operational details', async () => {
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
    expect(email).toHaveBeenCalledWith(
      'تجاوز حد مستحقات الموردين',
      expect.stringContaining('إجمالي_المستحق: 1500'),
      ['blinkbusinessdevelopment@gmail.com', 'merchant@example.com']
    );
    expect(whatsapp).toHaveBeenCalledWith(expect.stringContaining('الحد: 1000'), [
      '+201024898091',
      '+201011111111',
    ]);
  });
});
