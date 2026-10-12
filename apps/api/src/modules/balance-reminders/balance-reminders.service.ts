import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { BalanceReminderEvent } from './balance-reminder-event.entity';
import { Customer } from '@/modules/customers/entities/customer.entity';

export interface TenantReminderConfig {
  customerReminderDays: number;
  supplierReminderDays: number;
}

@Injectable()
export class BalanceRemindersService {
  private readonly logger = new Logger(BalanceRemindersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService
  ) {}

  async list(tenantId: string) {
    const [events, config, supplierLimit] = await Promise.all([
      this.dataSource.getRepository(BalanceReminderEvent).find({
        where: { tenantId, resolvedAt: IsNull(), snoozedAt: IsNull() },
        order: { notifiedAt: 'DESC' },
        take: 100,
      }),
      this.getTenantConfig(tenantId),
      this.getSupplierPayablesLimitStatus(tenantId),
    ]);
    return { events, config, supplierLimit };
  }

  async runDaily() {
    const tenants = await this.dataSource.query(
      `SELECT t.id, t.email, t.phone, t.business_name AS "businessName", tf.config
       FROM tenant_features tf
       JOIN features f ON f.id = tf.feature_id AND f.code = 'balance_reminders' AND f.is_active = true
       JOIN tenants t ON t.id = tf.tenant_id AND t.is_active = true AND t.deleted_at IS NULL
       WHERE tf.is_enabled = true AND (tf.expires_at IS NULL OR tf.expires_at > CURRENT_TIMESTAMP)`
    );
    const limitTenants = await this.dataSource.query(
      `SELECT t.id
       FROM tenant_features tf
       JOIN features f ON f.id = tf.feature_id AND f.code = 'supplier_balance_limit' AND f.is_active = true
       JOIN tenants t ON t.id = tf.tenant_id AND t.is_active = true AND t.deleted_at IS NULL
       WHERE tf.is_enabled = true AND (tf.expires_at IS NULL OR tf.expires_at > CURRENT_TIMESTAMP)`
    );

    let customerReminders = 0;
    let supplierReminders = 0;
    for (const tenant of tenants) {
      const config = this.normalizeConfig(tenant.config);
      const customerRows = await this.claimDueRows(
        tenant.id,
        'customer',
        config.customerReminderDays
      );
      const supplierRows = await this.claimDueRows(
        tenant.id,
        'supplier',
        config.supplierReminderDays
      );
      customerReminders += customerRows.length;
      supplierReminders += supplierRows.length;

      for (const item of customerRows) {
        const result = await this.notifications.sendOperationalAlert(
          {
            event: 'balance.customer_overdue',
            title: `تذكير بمديونية العميل ${item.partyName}`,
            details: {
              التاجر: tenant.businessName,
              العميل: item.partyName,
              الرصيد_المستحق: Number(item.balance),
              عدد_الأيام: item.reminderDays,
              تاريخ_الاستحقاق: item.dueAt,
            },
          },
          { email: tenant.email, whatsapp: tenant.phone }
        );
        await this.saveDeliveryStatus(item.id, result);
      }

      for (const item of supplierRows) {
        const result = await this.notifications.sendOperationalAlert(
          {
            event: 'balance.supplier_due',
            title: `تذكير برصيد المورد ${item.partyName}`,
            details: {
              التاجر: tenant.businessName,
              المورد: item.partyName,
              الرصيد_المستحق_للمورد: Number(item.balance),
              عدد_الأيام: item.reminderDays,
              تاريخ_الاستحقاق: item.dueAt,
            },
          },
          { email: tenant.email, whatsapp: tenant.phone }
        );
        await this.saveDeliveryStatus(item.id, result);
      }
    }

    let supplierLimitAlerts = 0;
    for (const tenant of limitTenants) {
      const state = await this.checkSupplierPayablesLimitSafely(tenant.id);
      if (state.notified) supplierLimitAlerts += 1;
    }

    return {
      tenantsProcessed: tenants.length,
      customerReminders,
      supplierReminders,
      supplierLimitTenantsProcessed: limitTenants.length,
      supplierLimitAlerts,
    };
  }

  async getSupplierPayablesLimitStatus(tenantId: string) {
    const config = await this.getSupplierLimitConfig(tenantId);
    const [[totals], [state]] = await Promise.all([
      this.dataSource.query(
        `SELECT COALESCE(SUM(GREATEST(balance, 0)), 0) AS "totalPayables"
         FROM suppliers WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId]
      ),
      this.dataSource.query(
        `SELECT is_over_limit AS "isOverLimit", total_payables AS "totalPayables",
                limit_amount AS "limitAmount", email_status AS "emailStatus",
                whatsapp_status AS "whatsappStatus", last_notified_at AS "lastNotifiedAt"
         FROM supplier_payables_limit_states WHERE tenant_id = $1`,
        [tenantId]
      ),
    ]);
    const totalPayables = Number(totals?.totalPayables || 0);
    return {
      enabled: config.enabled,
      configured: config.limitAmount > 0,
      limitAmount: config.limitAmount,
      totalPayables,
      overLimit: config.limitAmount > 0 && totalPayables > config.limitAmount,
      isAlertActive: Boolean(state?.isOverLimit),
      emailStatus: state?.emailStatus || 'skipped',
      whatsappStatus: state?.whatsappStatus || 'skipped',
      lastNotifiedAt: state?.lastNotifiedAt || null,
    };
  }

  async checkSupplierPayablesLimit(tenantId: string) {
    const config = await this.getSupplierLimitConfig(tenantId);
    if (!config.enabled || config.limitAmount <= 0) {
      await this.dataSource.query(
        `UPDATE supplier_payables_limit_states SET is_over_limit = false, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1`,
        [tenantId]
      );
      return { enabled: config.enabled, configured: false, overLimit: false, notified: false };
    }

    const outcome = await this.dataSource.transaction(async (manager) => {
      const [totals] = await manager.query(
        `SELECT COALESCE(SUM(GREATEST(balance, 0)), 0) AS total_payables
         FROM suppliers WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId]
      );
      const totalPayables = Number(totals?.total_payables || 0);
      await manager.query(
        `INSERT INTO supplier_payables_limit_states (tenant_id)
         VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
      );
      const [state] = await manager.query(
        `SELECT is_over_limit, limit_amount, email_status, whatsapp_status
         FROM supplier_payables_limit_states WHERE tenant_id = $1 FOR UPDATE`,
        [tenantId]
      );
      const overLimit = totalPayables > config.limitAmount;
      const limitChanged = Math.abs(Number(state.limit_amount) - config.limitAmount) >= 0.0001;
      const failedDelivery = state.email_status === 'failed' || state.whatsapp_status === 'failed';
      const shouldNotify = overLimit && (!state.is_over_limit || limitChanged || failedDelivery);
      await manager.query(
        `UPDATE supplier_payables_limit_states
         SET is_over_limit = $2, total_payables = $3, limit_amount = $4,
             email_status = CASE WHEN $5 THEN 'skipped' ELSE email_status END,
             whatsapp_status = CASE WHEN $5 THEN 'skipped' ELSE whatsapp_status END,
             last_notified_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE last_notified_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1`,
        [tenantId, overLimit, totalPayables, config.limitAmount, shouldNotify]
      );
      return { totalPayables, overLimit, shouldNotify };
    });

    if (!outcome.shouldNotify) {
      return {
        enabled: true,
        configured: true,
        limitAmount: config.limitAmount,
        ...outcome,
        notified: false,
      };
    }

    const [tenant] = await this.dataSource.query(
      `SELECT email, phone, business_name AS "businessName" FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const result = await this.notifications.sendOperationalAlert(
      {
        event: 'supplier.payables_limit_exceeded',
        title: 'تجاوز الحد المحدد للمبالغ المستحقة للموردين',
        details: {
          التاجر: tenant?.businessName || tenantId,
          إجمالي_المستحق_للموردين: outcome.totalPayables,
          الحد_المحدد: config.limitAmount,
          التجاوز: outcome.totalPayables - config.limitAmount,
        },
      },
      { email: tenant?.email, whatsapp: tenant?.phone }
    );
    await this.dataSource.query(
      `UPDATE supplier_payables_limit_states
       SET email_status = $2, whatsapp_status = $3, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1`,
      [tenantId, result.email, result.whatsapp]
    );
    return {
      enabled: true,
      configured: true,
      limitAmount: config.limitAmount,
      ...outcome,
      notified: true,
      delivery: result,
    };
  }

  async checkSupplierPayablesLimitSafely(tenantId: string) {
    try {
      return await this.checkSupplierPayablesLimit(tenantId);
    } catch (error) {
      this.logger.warn(
        `Could not check supplier payables limit for tenant ${tenantId}: ${error instanceof Error ? error.name : 'unknown error'}`
      );
      return { enabled: false, configured: false, overLimit: false, notified: false, failed: true };
    }
  }

  async snoozeCustomerReminder(tenantId: string, eventId: string) {
    const config = await this.getTenantConfig(tenantId);
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(BalanceReminderEvent, {
        where: { id: eventId, tenantId, partyType: 'customer', resolvedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) throw new NotFoundException('تنبيه العميل غير موجود أو تمت معالجته');
      const customer = await manager.findOne(Customer, {
        where: { id: event.partyId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!customer) throw new NotFoundException('العميل غير موجود');
      if (Number(customer.balance) < 0.0001) {
        event.resolvedAt = new Date();
        await manager.save(event);
        return { snoozed: false, resolved: true };
      }
      const now = new Date();
      customer.balanceReminderAnchorAt = now;
      customer.balanceReminderLastSentAt = now;
      event.snoozedAt = now;
      event.resolvedAt = now;
      await manager.save(customer);
      await manager.save(event);
      return {
        snoozed: true,
        nextReminderAt: new Date(now.getTime() + config.customerReminderDays * 86400000),
      };
    });
  }

  private async claimDueRows(
    tenantId: string,
    partyType: 'customer' | 'supplier',
    days: number
  ): Promise<Array<BalanceReminderEvent & { dueAt: Date }>> {
    return this.dataSource.transaction(async (manager) => {
      const table = partyType === 'customer' ? 'customers' : 'suppliers';
      const rows = await manager.query(
        `SELECT id, name, balance,
                COALESCE(balance_reminder_anchor_at, created_at) AS anchor_at
         FROM ${table}
         WHERE tenant_id = $1 AND deleted_at IS NULL AND balance >= 0.0001
           AND COALESCE(balance_reminder_last_sent_at, balance_reminder_anchor_at, created_at)
             <= CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 day')
         ORDER BY COALESCE(balance_reminder_last_sent_at, balance_reminder_anchor_at, created_at) ASC
         LIMIT 100 FOR UPDATE SKIP LOCKED`,
        [tenantId, days]
      );
      const claimed: Array<BalanceReminderEvent & { dueAt: Date }> = [];
      for (const row of rows) {
        await manager.query(
          `UPDATE balance_reminder_events SET resolved_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1 AND party_type = $2 AND party_id = $3 AND resolved_at IS NULL`,
          [tenantId, partyType, row.id]
        );
        const [event] = await manager.query(
          `INSERT INTO balance_reminder_events
             (tenant_id, party_type, party_id, party_name, balance, reminder_days, due_at, notified_at)
           VALUES ($1, $2, $3, $4, $5, $6,
             COALESCE($7::timestamp, CURRENT_TIMESTAMP) + ($6::int * INTERVAL '1 day'), CURRENT_TIMESTAMP)
           RETURNING id, tenant_id AS "tenantId", party_type AS "partyType", party_id AS "partyId",
             party_name AS "partyName", balance, reminder_days AS "reminderDays", due_at AS "dueAt",
             notified_at AS "notifiedAt", email_status AS "emailStatus", whatsapp_status AS "whatsappStatus"`,
          [tenantId, partyType, row.id, row.name, row.balance, days, row.anchor_at]
        );
        await manager.query(
          `UPDATE ${table} SET balance_reminder_last_sent_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id = $2`,
          [row.id, tenantId]
        );
        claimed.push(event);
      }
      return claimed;
    });
  }

  private async saveDeliveryStatus(
    eventId: string,
    result: { email: 'sent' | 'skipped' | 'failed'; whatsapp: 'sent' | 'skipped' | 'failed' }
  ) {
    await this.dataSource.query(
      `UPDATE balance_reminder_events SET email_status = $2, whatsapp_status = $3 WHERE id = $1`,
      [eventId, result.email, result.whatsapp]
    );
  }

  private async getSupplierLimitConfig(
    tenantId: string
  ): Promise<{ enabled: boolean; limitAmount: number }> {
    const [row] = await this.dataSource.query(
      `SELECT tf.config FROM tenant_features tf
       JOIN features f ON f.id = tf.feature_id
       WHERE tf.tenant_id = $1 AND f.code = 'supplier_balance_limit' AND f.is_active = true
         AND tf.is_enabled = true AND (tf.expires_at IS NULL OR tf.expires_at > CURRENT_TIMESTAMP)`,
      [tenantId]
    );
    const config = (row?.config && typeof row.config === 'object' ? row.config : {}) as Record<
      string,
      unknown
    >;
    const value = Number(config.limitAmount);
    return {
      enabled: Boolean(row),
      limitAmount: Number.isFinite(value) && value > 0 ? value : 0,
    };
  }

  private async getTenantConfig(tenantId: string): Promise<TenantReminderConfig> {
    const [row] = await this.dataSource.query(
      `SELECT tf.config FROM tenant_features tf
       JOIN features f ON f.id = tf.feature_id
       WHERE tf.tenant_id = $1 AND f.code = 'balance_reminders' AND tf.is_enabled = true`,
      [tenantId]
    );
    return this.normalizeConfig(row?.config);
  }

  private normalizeConfig(value: unknown): TenantReminderConfig {
    const config = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const normalizeDays = (raw: unknown) => {
      const days = Number(raw);
      return Number.isFinite(days) ? Math.min(3650, Math.max(1, Math.floor(days))) : 30;
    };
    return {
      customerReminderDays: normalizeDays(config.customerReminderDays),
      supplierReminderDays: normalizeDays(config.supplierReminderDays),
    };
  }
}
