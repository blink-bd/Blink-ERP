import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * إعدادات على مستوى المنصة كلها (مش تابعة لتاجر) — أولها قنوات الإرسال (إيميل وواتساب)
 * اللي المدير العام بيظبطها من لوحته بدل متغيرات البيئة على Render.
 * الأسرار (كلمات المرور/التوكنات) بتتحفظ متشفرة في عمود secrets.
 *
 * آمنة للتكرار.
 */
export class PlatformNotificationChannels1700000000031 implements MigrationInterface {
  name = 'PlatformNotificationChannels1700000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        secrets TEXT,
        updated_by VARCHAR(255),
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS platform_settings`);
  }
}
