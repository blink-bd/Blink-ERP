import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * كلمات مرور الموظفين بقت بتتغير من المدير العام بس: زرار «تغيير كلمات مرور الموظفين»
 * (users.reset_password) بقى مقفول افتراضياً، فبنقفله كمان عند التجار اللي كان
 * متسجل لهم مفتوح. المدير العام يقدر يفتحه لتاجر معين بعد كده لو حب.
 */
export class AdminManagedEmployeePasswords1700000000032 implements MigrationInterface {
  name = 'AdminManagedEmployeePasswords1700000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE tenant_features tf
         SET is_enabled = false, disabled_at = NOW()
        FROM features f
       WHERE f.id = tf.feature_id
         AND f.code = 'users.reset_password'
         AND tf.is_enabled = true
    `);
    await queryRunner.query(
      `UPDATE features SET is_default = false WHERE code = 'users.reset_password'`
    );
  }

  public async down(): Promise<void> {
    // مقصود: مانرجعش نفتح تغيير كلمات المرور للتجار تلقائياً.
  }
}
