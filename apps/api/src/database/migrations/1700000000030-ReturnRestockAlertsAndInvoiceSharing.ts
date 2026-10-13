import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - مصير تالت للصنف المرتجع: «رجوع على نفس الصنف الأصلي» (disposition = 'original').
 * - تنبيهات التاجر: واتساب وإيميل التاجر لاستقبال تنبيهات حسابه + اختيار أنواع التنبيهات.
 * - مشاركة فاتورة المشتريات كلينك عام (share_token) زي إيصال البيع الإلكتروني.
 *
 * آمنة للتكرار.
 */
export class ReturnRestockAlertsAndInvoiceSharing1700000000030 implements MigrationInterface {
  name = 'ReturnRestockAlertsAndInvoiceSharing1700000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sale_return_items DROP CONSTRAINT IF EXISTS sale_return_item_disposition_check`
    );
    await queryRunner.query(`
      ALTER TABLE sale_return_items ADD CONSTRAINT sale_return_item_disposition_check
        CHECK (disposition IN ('pending', 'supplier', 'restocked', 'original'))
    `);

    await queryRunner.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS alert_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS alert_whatsapp VARCHAR(30),
        ADD COLUMN IF NOT EXISTS alert_events JSONB
    `);

    await queryRunner.query(
      `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS share_token VARCHAR(64)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_share_token ON purchases(share_token)
       WHERE share_token IS NOT NULL`
    );

    // صلاحيات الإعدادات (موجودة في الـ seed) — نضمن وجودها في القواعد القديمة ونديها للمالك.
    for (const action of ['view', 'update']) {
      await queryRunner.query(
        `INSERT INTO permissions (resource, action, scope, name, category)
         VALUES ('settings', $1, 'all', $2, 'settings') ON CONFLICT (name) DO NOTHING`,
        [action, `settings.${action}`]
      );
    }
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.name = 'owner' AND p.name IN ('settings.view', 'settings.update')
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchases_share_token`);
    await queryRunner.query(`ALTER TABLE purchases DROP COLUMN IF EXISTS share_token`);
    await queryRunner.query(`
      ALTER TABLE tenants
        DROP COLUMN IF EXISTS alert_events,
        DROP COLUMN IF EXISTS alert_whatsapp,
        DROP COLUMN IF EXISTS alert_email
    `);
    await queryRunner.query(
      `UPDATE sale_return_items SET disposition = 'restocked' WHERE disposition = 'original'`
    );
    await queryRunner.query(
      `ALTER TABLE sale_return_items DROP CONSTRAINT IF EXISTS sale_return_item_disposition_check`
    );
    await queryRunner.query(`
      ALTER TABLE sale_return_items ADD CONSTRAINT sale_return_item_disposition_check
        CHECK (disposition IN ('pending', 'supplier', 'restocked'))
    `);
  }
}
