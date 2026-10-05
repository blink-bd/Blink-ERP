import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * الجداول المرتبطة بالمستأجر مباشرة عبر العمود tenant_id.
 * أي جدول جديد يحمل tenant_id يُضاف هنا ليدخل ضمن النسخة الاحتياطية تلقائياً.
 */
const TENANT_TABLES = [
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
  'customers',
  'suppliers',
  'supplier_payments',
  'payment_methods',
  'sales',
  'sale_items',
  'payments',
  'sale_returns',
  'sale_return_items',
  'purchases',
  'purchase_items',
  'cash_registers',
  'cash_register_shifts',
  'cash_transactions',
  'expense_categories',
  'expenses',
] as const;

/** أعمدة حساسة لا يجب أن تظهر في ملف النسخة الاحتياطية إطلاقاً. */
const SENSITIVE_KEY_PATTERN = /password|token|secret|otp/i;

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (!SENSITIVE_KEY_PATTERN.test(key)) clean[key] = row[key];
  }
  return clean;
}

export interface TenantBackup {
  meta: {
    format: string;
    version: number;
    generatedAt: string;
    tenantId: string;
  };
  tenant: Record<string, unknown> | null;
  tables: Record<string, Record<string, unknown>[]>;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * يُصدِّر نسخة احتياطية كاملة (JSON) لكل بيانات المستأجر الحالي.
   * البيانات الحساسة (كلمات المرور، التوكنات...) تُستبعد تلقائياً.
   */
  async exportTenantData(tenantId: string): Promise<TenantBackup> {
    const tables: Record<string, Record<string, unknown>[]> = {};

    // بيانات المستأجر نفسه
    const tenantRows = await this.dataSource.query(
      `SELECT * FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const tenant = tenantRows[0] ? sanitizeRow(tenantRows[0]) : null;

    // كل الجداول المرتبطة بالمستأجر
    for (const table of TENANT_TABLES) {
      try {
        const rows = await this.dataSource.query(
          `SELECT * FROM "${table}" WHERE tenant_id = $1 ORDER BY created_at ASC`,
          [tenantId]
        );
        tables[table] = rows.map(sanitizeRow);
      } catch (error) {
        // جدول غير موجود في هذه البيئة؟ سجّل وتابع بدل إسقاط النسخة كلها.
        this.logger.warn(`تعذّر تصدير الجدول ${table}: ${(error as Error).message}`);
        tables[table] = [];
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
      },
      tenant,
      tables,
    };
  }
}
