import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - حدود الحساب لكل تاجر (عدد المستخدمين / الفروع / المخازن) يحددها المدير العام.
 * - المصادقة الثنائية (2FA) وإبطال الجلسات للمدير العام.
 * - جدول مفاتيح الـ API (ميزة api_access) — المفتاح نفسه لا يُخزَّن، فقط بصمته SHA-256.
 * - صلاحيات جديدة: إدارة الأدوار، مفاتيح الـ API، استيراد/تصدير البيانات.
 * - فهرس لسجل التدقيق لكل تاجر.
 *
 * آمنة للتكرار (IF NOT EXISTS / ON CONFLICT).
 */
export class SecurityAndFeatureCompletion1700000000026 implements MigrationInterface {
  name = 'SecurityAndFeatureCompletion1700000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS max_users INTEGER,
        ADD COLUMN IF NOT EXISTS max_branches INTEGER,
        ADD COLUMN IF NOT EXISTS max_warehouses INTEGER;
    `);

    await queryRunner.query(`
      ALTER TABLE master_admins
        ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS totp_secret TEXT,
        ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS totp_last_step BIGINT,
        ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        key_hash CHAR(64) NOT NULL UNIQUE,
        permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        last_used_at TIMESTAMP,
        last_used_ip VARCHAR(45),
        expires_at TIMESTAMP,
        revoked_at TIMESTAMP,
        revoked_by UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC);
    `);

    const permissions: Array<[string, string, string]> = [
      ['roles', 'manage', 'users'],
      ['api_keys', 'manage', 'settings'],
      ['data', 'import', 'settings'],
      ['data', 'export', 'settings'],
      ['audit', 'view', 'settings'],
    ];
    for (const [resource, action, category] of permissions) {
      await queryRunner.query(
        `INSERT INTO permissions (resource, action, scope, name, category)
         VALUES ($1, $2, 'all', $3, $4) ON CONFLICT (name) DO NOTHING`,
        [resource, action, `${resource}.${action}`, category]
      );
    }
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.name = 'owner'
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS api_keys`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_tenant_date`);
    await queryRunner.query(`
      ALTER TABLE master_admins
        DROP COLUMN IF EXISTS session_version,
        DROP COLUMN IF EXISTS totp_secret,
        DROP COLUMN IF EXISTS totp_enabled,
        DROP COLUMN IF EXISTS totp_last_step,
        DROP COLUMN IF EXISTS password_changed_at;
    `);
    await queryRunner.query(`
      ALTER TABLE tenants
        DROP COLUMN IF EXISTS max_users,
        DROP COLUMN IF EXISTS max_branches,
        DROP COLUMN IF EXISTS max_warehouses;
    `);
  }
}
