import { BalanceRemindersService } from './balance-reminders.service';

describe('BalanceRemindersService', () => {
  const delivery = { email: 'sent' as const, whatsapp: 'skipped' as const };

  it('alerts once when total supplier payables cross the configured limit', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total_payables: '1500' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            is_over_limit: false,
            limit_amount: '0',
            email_status: 'skipped',
            whatsapp_status: 'skipped',
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ config: { limitAmount: 1000 } }])
        .mockResolvedValueOnce([
          { email: 'owner@example.com', phone: '+201000000000', businessName: 'متجر تجريبي' },
        ])
        .mockResolvedValueOnce([]),
      transaction: jest.fn((callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager)
      ),
    };
    const notifications = { sendOperationalAlert: jest.fn().mockResolvedValue(delivery) };
    const service = new BalanceRemindersService(dataSource as any, notifications as any);

    const result = await service.checkSupplierPayablesLimit('tenant-id');

    expect(result).toMatchObject({
      enabled: true,
      configured: true,
      totalPayables: 1500,
      limitAmount: 1000,
      overLimit: true,
      notified: true,
    });
    expect(notifications.sendOperationalAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'supplier.payables_limit_exceeded',
        details: expect.objectContaining({
          إجمالي_المستحق_للموردين: 1500,
          الحد_المحدد: 1000,
        }),
      }),
      { email: 'owner@example.com', whatsapp: '+201000000000' }
    );
    expect(manager.query).toHaveBeenCalledTimes(4);
  });

  it('does not alert while total payables remain under the configured limit', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total_payables: '900' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            is_over_limit: false,
            limit_amount: '1000',
            email_status: 'sent',
            whatsapp_status: 'skipped',
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValueOnce([{ config: { limitAmount: 1000 } }]),
      transaction: jest.fn((callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager)
      ),
    };
    const notifications = { sendOperationalAlert: jest.fn() };
    const service = new BalanceRemindersService(dataSource as any, notifications as any);

    const result = await service.checkSupplierPayablesLimit('tenant-id');

    expect(result).toMatchObject({ overLimit: false, notified: false, totalPayables: 900 });
    expect(notifications.sendOperationalAlert).not.toHaveBeenCalled();
  });

  it('normalizes reminder intervals to safe whole-day ranges', () => {
    const normalize = (new BalanceRemindersService({} as any, {} as any) as any).normalizeConfig;
    expect(normalize({ customerReminderDays: 0, supplierReminderDays: 5000 })).toEqual({
      customerReminderDays: 1,
      supplierReminderDays: 3650,
    });
    expect(normalize({})).toEqual({ customerReminderDays: 30, supplierReminderDays: 30 });
  });
});
