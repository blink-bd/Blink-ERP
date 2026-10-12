import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * صلاحيات المستخدم على الفروع/المخازن + «فرع العمل»:
 * - access_all_branches: المستخدم يشوف كل الفروع والمخازن (الافتراضي، عشان المستخدمين
 *   الحاليين يفضلوا زي ما هم من غير ما حد يتقفل عليه).
 * - allowed_branch_ids / allowed_warehouse_ids: الفروع والمخازن المسموح بيها لو مش «الكل».
 * - active_branch_id / active_warehouse_id: الفرع/المخزن اللي المستخدم شغال عليه حالياً
 *   (NULL = كل الفروع/المخازن المسموح بيها).
 *
 * آمنة للتكرار.
 */
export class UserBranchAccessAndWorkspace1700000000028 implements MigrationInterface {
  name = 'UserBranchAccessAndWorkspace1700000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS access_all_branches BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_branch_ids UUID[] NOT NULL DEFAULT '{}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_warehouse_ids UUID[] NOT NULL DEFAULT '{}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active_branch_id UUID;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active_warehouse_id UUID;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_purchases_tenant_branch ON purchases(tenant_id, branch_id)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_expenses_tenant_branch ON expenses(tenant_id, branch_id)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_expenses_tenant_branch`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchases_tenant_branch`);
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS active_warehouse_id;
      ALTER TABLE users DROP COLUMN IF EXISTS active_branch_id;
      ALTER TABLE users DROP COLUMN IF EXISTS allowed_warehouse_ids;
      ALTER TABLE users DROP COLUMN IF EXISTS allowed_branch_ids;
      ALTER TABLE users DROP COLUMN IF EXISTS access_all_branches;
    `);
  }
}
