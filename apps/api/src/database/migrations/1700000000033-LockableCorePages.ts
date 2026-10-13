import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * لوحة التحكم والمستخدمين والإعدادات كانت «أساسية» ومفتوحة دايماً مهما كان المسجّل.
 * دلوقتي المدير العام يقدر يقفلها، فأي صف قديم متسجل «مقفول» ليها (كان ملهوش تأثير)
 * لازم يرجع مفتوح عشان مافيش تاجر يتقفل عليه فجأة بعد التحديث.
 */
export class LockableCorePages1700000000033 implements MigrationInterface {
  name = 'LockableCorePages1700000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE tenant_features tf
         SET is_enabled = true, disabled_at = NULL, expires_at = NULL
        FROM features f
       WHERE f.id = tf.feature_id
         AND f.code IN ('dashboard', 'users', 'settings')
         AND (tf.is_enabled = false OR tf.expires_at IS NOT NULL)
    `);
  }

  public async down(): Promise<void> {
    // لا شيء: الصفوف دي كانت مفتوحة فعلياً قبل الـ migration.
  }
}
