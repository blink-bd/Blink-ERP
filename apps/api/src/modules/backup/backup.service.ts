import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * ترتيب مفضّل للجداول في الملف (الأساسيات الأول). أي جدول تاني فيه tenant_id بيتضاف
 * تلقائياً بعدهم، فمفيش جدول جديد يتنسي من النسخة الاحتياطية.
 */
const PREFERRED_ORDER = [
  'tenant_branding',
  'tenant_features',
  'branches',
  'warehouses',
  'users',
  'roles',
  'brands',
  'categories',
  'products',
  'inventory',
  'inventory_transactions',
  'inventory_transfers',
  'inventory_transfer_items',
  'customers',
  'suppliers',
  'branch_party_balances',
  'party_balance_adjustments',
  'supplier_payments',
  'payment_methods',
  'sales',
  'sale_items',
  'payments',
  'sale_returns',
  'sale_return_items',
  'purchases',
  'purchase_items',
  'supplier_returns',
  'cash_registers',
  'cash_register_shifts',
  'cash_transactions',
  'expense_categories',
  'expenses',
  'maintenance_invoices',
  'invoice_attachments',
  'document_counters',
] as const;

/**
 * جداول فيها tenant_id بس مش بيانات تجارية للتاجر (سجلات تشغيل/أمان) — نفس استثناءات
 * نسخة المدير العام + سجل إرسال الـ webhooks.
 */
const EXCLUDED_TABLES = new Set(['audit_logs', 'api_keys', 'master_admins', 'webhook_deliveries']);

/** أعمدة حساسة لا يجب أن تظهر في ملف النسخة الاحتياطية إطلاقاً. */
const SENSITIVE_KEY_PATTERN = /password|token|secret|otp|hash|totp/i;

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    // محتوى الملفات (bytea) مابيدخلش في ملف JSON — بيانات المرفق نفسها (الاسم/النوع/الحجم) بتفضل.
    if (Buffer.isBuffer(row[key])) continue;
    clean[key] = row[key];
  }
  return clean;
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

export interface TenantBackup {
  meta: {
    format: string;
    version: number;
    generatedAt: string;
    tenantId: string;
    /** عدد الصفوف في كل جدول — للتأكد إن النسخة كاملة. */
    rowCounts: Record<string, number>;
    /** جداول ماتصدّرتش بسبب خطأ (المفروض تبقى فاضية). */
    skippedTables: { table: string; reason: string }[];
    /** ملاحظات عن محتوى الملف. */
    notes: string[];
  };
  tenant: Record<string, unknown> | null;
  tables: Record<string, Record<string, unknown>[]>;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * الجداول اللي فيها tenant_id + عمود الترتيب المناسب لكل جدول:
   * created_at لو موجود، وإلا id، وإلا من غير ترتيب (زي جدول المخزون اللي مافيهوش created_at).
   */
  private async tenantTables(): Promise<{ table: string; orderBy: string | null }[]> {
    const rows: { table_name: string; columns: string[] }[] = await this.dataSource.query(
      `SELECT c.table_name::text AS table_name, array_agg(c.column_name::text) AS columns
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        GROUP BY c.table_name
       HAVING bool_or(c.column_name = 'tenant_id')`
    );
    const rank = (table: string) => {
      const index = (PREFERRED_ORDER as readonly string[]).indexOf(table);
      return index === -1 ? PREFERRED_ORDER.length : index;
    };
    return rows
      .filter((row) => !EXCLUDED_TABLES.has(row.table_name))
      .sort(
        (a, b) =>
          rank(a.table_name) - rank(b.table_name) || a.table_name.localeCompare(b.table_name)
      )
      .map((row) => ({
        table: row.table_name,
        orderBy: row.columns.includes('created_at')
          ? 'created_at'
          : row.columns.includes('id')
            ? 'id'
            : null,
      }));
  }

  /**
   * يُصدِّر نسخة احتياطية كاملة (JSON) لكل بيانات المستأجر الحالي.
   * البيانات الحساسة (كلمات المرور، التوكنات...) تُستبعد تلقائياً.
   */
  async exportTenantData(tenantId: string): Promise<TenantBackup> {
    const tables: Record<string, Record<string, unknown>[]> = {};

    // بيانات المستأجر نفسه
    const tenantRows = await this.dataSource.query(`SELECT * FROM tenants WHERE id = $1`, [
      tenantId,
    ]);
    const tenant = tenantRows[0] ? sanitizeRow(tenantRows[0]) : null;

    // كل الجداول المرتبطة بالمستأجر (اكتشاف تلقائي لأي جدول فيه tenant_id).
    const skippedTables: { table: string; reason: string }[] = [];
    for (const { table, orderBy } of await this.tenantTables()) {
      try {
        const rows = await this.dataSource.query(
          `SELECT * FROM ${quoteIdent(table)} WHERE tenant_id = $1${
            orderBy ? ` ORDER BY ${quoteIdent(orderBy)} ASC` : ''
          }`,
          [tenantId]
        );
        tables[table] = rows.map(sanitizeRow);
      } catch (error) {
        // مانسقطش النسخة كلها، بس الجدول بيتسجل في الملف كـ«ماتصدّرش» بدل ما يطلع فاضي في صمت.
        const reason = (error as Error).message;
        this.logger.error(`تعذّر تصدير الجدول ${table}: ${reason}`);
        skippedTables.push({ table, reason });
      }
    }

    // جداول الربط (لا تحمل tenant_id مباشرة)
    tables['user_roles'] = await this.dataSource.query(
      `SELECT ur.* FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       WHERE u.tenant_id = $1`,
      [tenantId]
    );

    tables['role_permissions'] = await this.dataSource.query(
      `SELECT rp.* FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       WHERE r.tenant_id = $1`,
      [tenantId]
    );

    return {
      meta: {
        format: 'blink-erp-tenant-backup',
        version: 1,
        generatedAt: new Date().toISOString(),
        tenantId,
        rowCounts: Object.fromEntries(
          Object.entries(tables).map(([table, rows]) => [table, rows.length])
        ),
        skippedTables,
        notes: [
          'كلمات المرور والتوكنات والأسرار مش موجودة في الملف.',
          'المرفقات: بيانات الملف بس (الاسم/النوع/الحجم) من غير محتوى الملف نفسه.',
        ],
      },
      tenant,
      tables,
    };
  }
}
