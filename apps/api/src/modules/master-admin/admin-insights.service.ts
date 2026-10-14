import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FEATURE_CATALOG } from '@/modules/features/features.catalog';
import { FeaturesService } from '@/modules/features/features.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

const DAY_MS = 86_400_000;
const n = (value: unknown) => Number(value || 0);

/** المبلغ الشهري المكافئ للاشتراك (السنوي ÷ 12). */
const monthlyValue = (amount: unknown, cycle?: string | null) =>
  cycle === 'yearly' ? n(amount) / 12 : n(amount);

export interface HealthFlag {
  level: 'danger' | 'warning' | 'info';
  code: string;
  message: string;
}

/**
 * بيانات لوحة المدير العام: صحة كل حساب (الاشتراك، النشاط، الأمان، الاستخدام) — من غير
 * مبالغ مبيعات التجار.
 */
@Injectable()
export class AdminInsightsService {
  private softDeleteTables?: Set<string>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly features: FeaturesService,
    private readonly notifications: NotificationsService
  ) {}

  /** الجداول اللي فيها deleted_at (عشان العدّ يستبعد المحذوف). */
  private async alive(table: string, alias = ''): Promise<string> {
    if (!this.softDeleteTables) {
      const rows = await this.dataSource.query(
        `SELECT table_name AS name FROM information_schema.columns
         WHERE table_schema = current_schema() AND column_name = 'deleted_at'`
      );
      this.softDeleteTables = new Set(rows.map((row: { name: string }) => row.name));
    }
    return this.softDeleteTables.has(table)
      ? ` AND ${alias ? `${alias}.` : ''}deleted_at IS NULL`
      : '';
  }

  private tables?: Set<string>;
  /** الجداول الموجودة فعلاً — عشان جدول ناقص في قاعدة قديمة مايوقعش الصفحة كلها. */
  private async existingTables(): Promise<Set<string>> {
    if (!this.tables) {
      const rows = await this.dataSource.query(
        `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()`
      );
      this.tables = new Set(rows.map((row: { name: string }) => row.name));
    }
    return this.tables;
  }

  // ------------------------------------------------------------------ dashboard
  async dashboard() {
    const [t] = await this.dataSource.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active AND subscription_status = 'active'
          AND (subscription_end_date IS NULL OR subscription_end_date > NOW()))::int AS active,
        COUNT(*) FILTER (WHERE NOT is_active OR subscription_status IN ('suspended','cancelled'))::int AS suspended,
        COUNT(*) FILTER (WHERE is_active AND (subscription_status = 'expired'
          OR (subscription_end_date IS NOT NULL AND subscription_end_date <= NOW())))::int AS expired,
        COUNT(*) FILTER (WHERE is_active AND subscription_end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days')::int AS "expiring7d",
        COUNT(*) FILTER (WHERE is_active AND subscription_end_date BETWEEN NOW() AND NOW() + INTERVAL '30 days')::int AS "expiring30d",
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS "new30d"
      FROM tenants WHERE deleted_at IS NULL`);

    const [u] = await this.dataSource.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE u.is_active)::int AS active,
        COUNT(*) FILTER (WHERE u.last_login_at > NOW() - INTERVAL '1 day')::int AS "activeToday",
        COUNT(*) FILTER (WHERE u.last_login_at > NOW() - INTERVAL '7 days')::int AS "active7d",
        COUNT(*) FILTER (WHERE u.locked_until > NOW())::int AS locked
      FROM users u JOIN tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
      WHERE u.deleted_at IS NULL`);

    // آخر نشاط لكل تاجر = آخر دخول لأي مستخدم عنده.
    const activity = await this.dataSource.query(`
      SELECT t.id, COALESCE(t.business_name_ar, t.business_name) AS "businessName",
             t.created_at AS "createdAt", MAX(u.last_login_at) AS "lastActivityAt"
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id AND u.deleted_at IS NULL
      WHERE t.deleted_at IS NULL AND t.is_active
      GROUP BY t.id`);
    const now = Date.now();
    const inactive = activity
      .filter(
        (row: any) =>
          !row.lastActivityAt || now - new Date(row.lastActivityAt).getTime() > 14 * DAY_MS
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.lastActivityAt || 0).getTime() - new Date(b.lastActivityAt || 0).getTime()
      );

    const subs = await this.dataSource.query(`
      SELECT id, COALESCE(business_name_ar, business_name) AS "businessName",
             subscription_end_date AS "endDate", subscription_amount AS amount,
             subscription_cycle AS cycle, subscription_status AS status, is_active AS "isActive"
      FROM tenants WHERE deleted_at IS NULL`);
    const payingActive = subs.filter(
      (row: any) =>
        row.isActive &&
        row.status === 'active' &&
        (!row.endDate || new Date(row.endDate).getTime() > now)
    );
    const mrr = payingActive.reduce(
      (sum: number, row: any) => sum + monthlyValue(row.amount, row.cycle),
      0
    );
    const renewals = subs
      .filter(
        (row: any) =>
          row.isActive &&
          row.endDate &&
          new Date(row.endDate).getTime() < now + 30 * DAY_MS &&
          new Date(row.endDate).getTime() > now - 30 * DAY_MS
      )
      .map((row: any) => ({
        id: row.id,
        businessName: row.businessName,
        endDate: row.endDate,
        daysLeft: Math.ceil((new Date(row.endDate).getTime() - now) / DAY_MS),
        amount: row.amount === null ? null : n(row.amount),
        cycle: row.cycle,
      }))
      .sort((a: any, b: any) => a.daysLeft - b.daysLeft);
    const renewalsValue30d = renewals
      .filter((row: any) => row.daysLeft >= 0)
      .reduce((sum: number, row: any) => sum + n(row.amount), 0);

    const security = await this.dataSource.query(`
      SELECT a.tenant_id AS id, COALESCE(t.business_name_ar, t.business_name) AS "businessName",
             COUNT(*) FILTER (WHERE a.action = 'TENANT_LOGIN_FAILED')::int AS failed,
             COUNT(*) FILTER (WHERE a.action = 'TENANT_ACCOUNT_LOCKED')::int AS locked,
             MAX(a.created_at) AS "lastAt"
      FROM audit_logs a JOIN tenants t ON t.id = a.tenant_id AND t.deleted_at IS NULL
      WHERE a.action IN ('TENANT_LOGIN_FAILED', 'TENANT_ACCOUNT_LOCKED')
        AND a.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY a.tenant_id, t.business_name_ar, t.business_name
      ORDER BY failed DESC LIMIT 8`);

    const growth = await this.dataSource.query(`
      SELECT to_char(date_trunc('month', m), 'YYYY-MM') AS month,
             (SELECT COUNT(*)::int FROM tenants
              WHERE deleted_at IS NULL AND date_trunc('month', created_at) = date_trunc('month', m)) AS count
      FROM generate_series(date_trunc('month', NOW()) - INTERVAL '5 months',
                           date_trunc('month', NOW()), INTERVAL '1 month') AS m
      ORDER BY 1`);

    const recent = await this.dataSource.query(`
      SELECT id, COALESCE(business_name_ar, business_name) AS "businessName", created_at AS "createdAt"
      FROM tenants WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 6`);

    // انتشار الميزات المدفوعة (كام تاجر مفعّلها).
    const paidCodes = FEATURE_CATALOG.filter((f) => f.requiresPlan && !f.parent).map((f) => f.code);
    const adoptionRows = paidCodes.length
      ? await this.dataSource.query(
          `SELECT f.code, COUNT(tf.id) FILTER (WHERE tf.is_enabled AND tf.deleted_at IS NULL
                     AND (tf.expires_at IS NULL OR tf.expires_at > NOW()))::int AS tenants
           FROM features f
           LEFT JOIN tenant_features tf ON tf.feature_id = f.id
             AND tf.tenant_id IN (SELECT id FROM tenants WHERE deleted_at IS NULL)
           WHERE f.code = ANY($1)
           GROUP BY f.code`,
          [paidCodes]
        )
      : [];
    const adoption = paidCodes.map((code) => ({
      code,
      nameAr: FEATURE_CATALOG.find((f) => f.code === code)?.nameAr || code,
      tenants: n(adoptionRows.find((row: any) => row.code === code)?.tenants),
    }));

    const channels = await this.notifications.getStatus();

    return {
      tenants: t,
      users: u,
      revenue: {
        monthlyRecurring: Math.round(mrr * 100) / 100,
        yearlyRunRate: Math.round(mrr * 12 * 100) / 100,
        payingTenants: payingActive.filter((row: any) => n(row.amount) > 0).length,
        withoutAmount: payingActive.filter((row: any) => !n(row.amount)).length,
        renewalsValue30d: Math.round(renewalsValue30d * 100) / 100,
      },
      renewals: renewals.slice(0, 10),
      inactive: {
        count: inactive.length,
        neverLoggedIn: inactive.filter((row: any) => !row.lastActivityAt).length,
        items: inactive.slice(0, 8),
      },
      security: {
        failedLogins24h: security.reduce((sum: number, row: any) => sum + n(row.failed), 0),
        tenants: security,
      },
      growth,
      recent,
      adoption,
      channels: {
        email: channels.email.configured,
        emailProvider: channels.email.provider,
        whatsapp: channels.whatsapp.configured,
      },
    };
  }

  // ------------------------------------------------------------------ tenants
  async tenants() {
    const rows = await this.dataSource.query(`
      SELECT t.id, t.business_name AS "businessName", t.business_name_ar AS "businessNameAr",
             t.email, t.phone, t.city, t.country, t.is_active AS "isActive",
             t.subscription_status AS "subscriptionStatus", t.subscription_end_date AS "subscriptionEndDate",
             t.subscription_amount AS "subscriptionAmount", t.subscription_cycle AS "subscriptionCycle",
             t.created_at AS "createdAt", p.name_ar AS "planName",
             (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS users,
             (SELECT COUNT(*)::int FROM branches b WHERE b.tenant_id = t.id AND b.deleted_at IS NULL) AS branches,
             (SELECT MAX(u.last_login_at) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS "lastActivityAt",
             (SELECT COUNT(*)::int FROM sales s WHERE s.tenant_id = t.id
                AND s.created_at > NOW() - INTERVAL '30 days') AS "operations30d",
             (SELECT COUNT(*)::int FROM audit_logs a WHERE a.tenant_id = t.id
                AND a.action = 'TENANT_LOGIN_FAILED' AND a.created_at > NOW() - INTERVAL '24 hours') AS "failedLogins24h",
             (SELECT u.full_name FROM users u
                JOIN user_roles ur ON ur.user_id = u.id
                JOIN roles r ON r.id = ur.role_id AND r.name = 'owner'
              WHERE u.tenant_id = t.id AND u.deleted_at IS NULL
              ORDER BY u.created_at LIMIT 1) AS "ownerName"
      FROM tenants t
      LEFT JOIN plans p ON p.id = t.plan_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.created_at DESC`);
    return rows.map((row: any) => ({
      ...row,
      subscriptionAmount: row.subscriptionAmount === null ? null : n(row.subscriptionAmount),
      daysLeft: row.subscriptionEndDate
        ? Math.ceil((new Date(row.subscriptionEndDate).getTime() - Date.now()) / DAY_MS)
        : null,
      health: this.healthFlags({
        isActive: row.isActive,
        subscriptionStatus: row.subscriptionStatus,
        subscriptionEndDate: row.subscriptionEndDate,
        lastActivityAt: row.lastActivityAt,
        failedLogins24h: row.failedLogins24h,
        createdAt: row.createdAt,
      }),
    }));
  }

  private healthFlags(input: {
    isActive: boolean;
    subscriptionStatus: string;
    subscriptionEndDate?: Date | string | null;
    lastActivityAt?: Date | string | null;
    failedLogins24h?: number;
    lockedUsers?: number;
    createdAt?: Date | string | null;
    alertsConfigured?: boolean;
  }): HealthFlag[] {
    const flags: HealthFlag[] = [];
    const now = Date.now();
    if (!input.isActive)
      flags.push({ level: 'danger', code: 'suspended', message: 'الحساب موقوف' });
    if (input.subscriptionEndDate) {
      const days = Math.ceil((new Date(input.subscriptionEndDate).getTime() - now) / DAY_MS);
      if (days < 0) {
        flags.push({ level: 'danger', code: 'expired', message: `الاشتراك منتهي من ${-days} يوم` });
      } else if (days <= 7) {
        flags.push({
          level: 'warning',
          code: 'expiring',
          message: `الاشتراك ينتهي خلال ${days} يوم`,
        });
      }
    } else if (input.subscriptionStatus === 'expired') {
      flags.push({ level: 'danger', code: 'expired', message: 'الاشتراك منتهي' });
    }
    if (input.isActive) {
      if (!input.lastActivityAt) {
        const age = input.createdAt ? (now - new Date(input.createdAt).getTime()) / DAY_MS : 99;
        if (age > 2) {
          flags.push({
            level: 'warning',
            code: 'never_logged_in',
            message: 'محدش دخل الحساب لحد دلوقتي',
          });
        }
      } else {
        const idle = Math.floor((now - new Date(input.lastActivityAt).getTime()) / DAY_MS);
        if (idle >= 14) {
          flags.push({ level: 'warning', code: 'inactive', message: `مفيش دخول من ${idle} يوم` });
        }
      }
    }
    if (n(input.failedLogins24h) >= 5) {
      flags.push({
        level: n(input.failedLogins24h) >= 15 ? 'danger' : 'warning',
        code: 'failed_logins',
        message: `${input.failedLogins24h} محاولة دخول فاشلة آخر 24 ساعة`,
      });
    }
    if (n(input.lockedUsers) > 0) {
      flags.push({
        level: 'warning',
        code: 'locked_users',
        message: `${input.lockedUsers} مستخدم مقفول مؤقتاً`,
      });
    }
    if (input.alertsConfigured === false) {
      flags.push({
        level: 'info',
        code: 'no_alert_contacts',
        message: 'التاجر ما حطش واتساب/إيميل للتنبيهات',
      });
    }
    return flags;
  }

  // ------------------------------------------------------------------ profile
  async tenantProfile(id: string) {
    const [tenant] = await this.dataSource.query(
      `SELECT t.*, p.name_ar AS plan_name, p.price_monthly AS plan_price
       FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [id]
    );
    if (!tenant) throw new NotFoundException('التاجر غير موجود');

    // كل العدّادات في استعلام واحد (اتصال واحد بقاعدة البيانات) — تشغيلها بالتوازي كان
    // بيفتح ~18 اتصال مرة واحدة ويتخطى حد الاتصالات في Supabase فيرجع خطأ 500.
    const specs: Array<[string, string, string]> = [
      ['users', 'users', ''],
      ['activeUsers', 'users', ' AND is_active'],
      ['lockedUsers', 'users', ' AND locked_until > NOW()'],
      ['branches', 'branches', ''],
      ['warehouses', 'warehouses', ''],
      ['products', 'products', ''],
      ['customers', 'customers', ''],
      ['suppliers', 'suppliers', ''],
      ['sales', 'sales', " AND status = 'completed'"],
      [
        'sales30d',
        'sales',
        " AND status = 'completed' AND created_at > NOW() - INTERVAL '30 days'",
      ],
      ['purchases', 'purchases', ''],
      ['purchases30d', 'purchases', " AND created_at > NOW() - INTERVAL '30 days'"],
      ['returns', 'sale_returns', ''],
      ['expenses', 'expenses', ''],
      ['maintenance', 'maintenance_invoices', ''],
      ['transfers', 'inventory_transfers', ''],
      [
        'apiKeys',
        'api_keys',
        ' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())',
      ],
      ['webhooks', 'webhook_endpoints', ''],
    ];
    const existing = await this.existingTables();
    const parts: string[] = [];
    for (const [key, table, where] of specs) {
      parts.push(
        existing.has(table)
          ? `(SELECT COUNT(*)::int FROM ${table} WHERE tenant_id = $1${await this.alive(table)}${where}) AS "${key}"`
          : `0 AS "${key}"`
      );
    }
    const [counts] = await this.dataSource.query(`SELECT ${parts.join(',\n')}`, [id]);
    const c = (key: string) => n(counts?.[key]);
    const users = c('users');
    const activeUsers = c('activeUsers');
    const lockedUsers = c('lockedUsers');
    const branches = c('branches');
    const warehouses = c('warehouses');
    const products = c('products');
    const customers = c('customers');
    const suppliers = c('suppliers');
    const sales = c('sales');
    const sales30d = c('sales30d');
    const purchases = c('purchases');
    const purchases30d = c('purchases30d');
    const returns = c('returns');
    const expenses = c('expenses');
    const maintenance = c('maintenance');
    const transfers = c('transfers');
    const apiKeys = c('apiKeys');
    const webhooks = c('webhooks');

    const [attachments] = existing.has('invoice_attachments')
      ? await this.dataSource.query(
          `SELECT COUNT(*)::int AS count, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
           FROM invoice_attachments WHERE tenant_id = $1${await this.alive('invoice_attachments')}`,
          [id]
        )
      : [{ count: 0, bytes: 0 }];
    const [logins] = await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE action = 'TENANT_LOGIN' AND created_at > NOW() - INTERVAL '30 days')::int AS "logins30d",
         COUNT(DISTINCT date_trunc('day', created_at)) FILTER (WHERE action = 'TENANT_LOGIN'
            AND created_at > NOW() - INTERVAL '30 days')::int AS "activeDays30d",
         COUNT(*) FILTER (WHERE action = 'TENANT_LOGIN_FAILED' AND created_at > NOW() - INTERVAL '24 hours')::int AS "failedLogins24h",
         COUNT(*) FILTER (WHERE action = 'TENANT_LOGIN_FAILED' AND created_at > NOW() - INTERVAL '7 days')::int AS "failedLogins7d",
         MAX(created_at) FILTER (WHERE action = 'TENANT_LOGIN_FAILED') AS "lastFailedLoginAt",
         MAX(created_at) AS "lastAuditAt"
       FROM audit_logs WHERE tenant_id = $1`,
      [id]
    );
    const [owner] = await this.dataSource.query(
      `SELECT u.id, u.full_name AS "fullName", u.email, u.username, u.phone,
              u.last_login_at AS "lastLoginAt"
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.name = 'owner'
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
       ORDER BY u.created_at LIMIT 1`,
      [id]
    );
    // نشاط آخر 14 يوم (عدد العمليات في اليوم — من غير مبالغ).
    const daily = await this.dataSource.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day,
              (SELECT COUNT(*)::int FROM sales s WHERE s.tenant_id = $1
                 AND s.created_at >= d AND s.created_at < d + INTERVAL '1 day') AS sales,
              (SELECT COUNT(*)::int FROM purchases p WHERE p.tenant_id = $1
                 AND p.created_at >= d AND p.created_at < d + INTERVAL '1 day') AS purchases,
              (SELECT COUNT(*)::int FROM audit_logs a WHERE a.tenant_id = $1 AND a.action = 'TENANT_LOGIN'
                 AND a.created_at >= d AND a.created_at < d + INTERVAL '1 day') AS logins
       FROM generate_series(date_trunc('day', NOW()) - INTERVAL '13 days', date_trunc('day', NOW()),
                            INTERVAL '1 day') AS d
       ORDER BY 1`,
      [id]
    );

    const [dates] = await this.dataSource.query(
      `SELECT
         (SELECT MAX(last_login_at) FROM users WHERE tenant_id = $1${await this.alive('users')}) AS "lastLoginAt",
         (SELECT MAX(created_at) FROM sales WHERE tenant_id = $1${await this.alive('sales')}) AS "lastSaleAt",
         (SELECT MAX(created_at) FROM purchases WHERE tenant_id = $1${await this.alive('purchases')}) AS "lastPurchaseAt",
         (SELECT MIN(created_at) FROM sales WHERE tenant_id = $1) AS "firstSaleAt"`,
      [id]
    );
    const lastLoginAt = dates?.lastLoginAt || null;
    const lastSaleAt = dates?.lastSaleAt || null;
    const lastPurchaseAt = dates?.lastPurchaseAt || null;
    const firstSaleAt = dates?.firstSaleAt || null;

    const featureRows = await this.features.getAllWithStatus(id);
    const pages = featureRows.filter((f) => f.kind === 'page');
    const actions = featureRows.filter((f) => f.kind === 'action');

    const alertsConfigured = Boolean(tenant.alert_email || tenant.alert_whatsapp);
    const now = Date.now();
    return {
      tenant: {
        id: tenant.id,
        businessName: tenant.business_name,
        businessNameAr: tenant.business_name_ar,
        email: tenant.email,
        phone: tenant.phone,
        address: tenant.address,
        city: tenant.city,
        country: tenant.country,
        currency: tenant.currency,
        timezone: tenant.timezone,
        isActive: tenant.is_active,
        createdAt: tenant.created_at,
      },
      owner: owner || null,
      contacts: {
        alertEmail: tenant.alert_email,
        alertWhatsapp: tenant.alert_whatsapp,
        alertsConfigured,
      },
      subscription: {
        status: tenant.subscription_status,
        planName: tenant.plan_name,
        planPrice: tenant.plan_price === null ? null : n(tenant.plan_price),
        amount: tenant.subscription_amount === null ? null : n(tenant.subscription_amount),
        cycle: tenant.subscription_cycle,
        monthlyValue: monthlyValue(tenant.subscription_amount, tenant.subscription_cycle),
        startDate: tenant.subscription_start_date,
        endDate: tenant.subscription_end_date,
        daysLeft: tenant.subscription_end_date
          ? Math.ceil((new Date(tenant.subscription_end_date).getTime() - now) / DAY_MS)
          : null,
        customerForDays: Math.floor((now - new Date(tenant.created_at).getTime()) / DAY_MS),
        note: tenant.subscription_note,
      },
      usage: {
        users,
        activeUsers,
        branches,
        warehouses,
        products,
        customers,
        suppliers,
        apiKeys,
        webhooks,
        attachments: n(attachments?.count),
        attachmentsBytes: n(attachments?.bytes),
        limits: {
          maxUsers: tenant.max_users,
          maxBranches: tenant.max_branches,
          maxWarehouses: tenant.max_warehouses,
          maxProducts: tenant.max_products,
        },
      },
      activity: {
        lastLoginAt,
        lastSaleAt,
        lastPurchaseAt,
        firstSaleAt,
        logins30d: n(logins?.logins30d),
        activeDays30d: n(logins?.activeDays30d),
        documents: {
          sales,
          sales30d,
          purchases,
          purchases30d,
          returns,
          expenses,
          maintenance,
          transfers,
        },
        daily,
      },
      security: {
        failedLogins24h: n(logins?.failedLogins24h),
        failedLogins7d: n(logins?.failedLogins7d),
        lastFailedLoginAt: logins?.lastFailedLoginAt || null,
        lockedUsers,
        activeApiKeys: apiKeys,
      },
      features: {
        pagesEnabled: pages.filter((f) => f.isEffective).length,
        pagesTotal: pages.length,
        actionsDisabled: actions.filter((f) => !f.isEnabled).length,
        actionsTotal: actions.length,
      },
      health: this.healthFlags({
        isActive: tenant.is_active,
        subscriptionStatus: tenant.subscription_status,
        subscriptionEndDate: tenant.subscription_end_date,
        lastActivityAt: lastLoginAt,
        failedLogins24h: n(logins?.failedLogins24h),
        lockedUsers,
        createdAt: tenant.created_at,
        alertsConfigured,
      }),
    };
  }

  /** الفروع ومخازنها وعدد المستخدمين في كل فرع. */
  async tenantBranches(id: string) {
    const branches = await this.dataSource.query(
      `SELECT b.id, b.name, b.code, b.is_main AS "isMain", b.is_active AS "isActive",
              b.address, b.phone, b.created_at AS "createdAt",
              (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = b.tenant_id AND u.deleted_at IS NULL
                 AND (u.access_all_branches OR b.id = ANY(u.allowed_branch_ids))) AS users,
              (SELECT COUNT(*)::int FROM sales s WHERE s.tenant_id = b.tenant_id AND s.branch_id = b.id
                 AND s.created_at > NOW() - INTERVAL '30 days') AS "operations30d"
       FROM branches b
       WHERE b.tenant_id = $1${await this.alive('branches', 'b')}
       ORDER BY b.is_main DESC, b.created_at`,
      [id]
    );
    const warehouses = await this.dataSource.query(
      `SELECT w.id, w.name, w.code, w.branch_id AS "branchId", w.is_active AS "isActive",
              w.shared_branch_ids AS "sharedBranchIds",
              (SELECT COUNT(*)::int FROM inventory i WHERE i.tenant_id = w.tenant_id
                 AND i.warehouse_id = w.id AND i.quantity > 0) AS "productsInStock"
       FROM warehouses w
       WHERE w.tenant_id = $1${await this.alive('warehouses', 'w')}
       ORDER BY w.created_at`,
      [id]
    );
    return branches.map((branch: any) => ({
      ...branch,
      // المخزن المشترك بيظهر مع كل فرع بيستخدمه، ومعلّم إنه مشترك عند الفروع التانية.
      warehouses: warehouses
        .filter(
          (w: any) => w.branchId === branch.id || (w.sharedBranchIds || []).includes(branch.id)
        )
        .map(({ sharedBranchIds, ...w }: any) => ({
          ...w,
          shared: w.branchId !== branch.id,
          sharedBranchCount: (sharedBranchIds || []).length,
        })),
    }));
  }
}
