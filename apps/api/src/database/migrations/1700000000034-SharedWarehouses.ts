import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * مخزن مشترك بين أكتر من فرع: المخزن بيفضل له فرع أساسي (branch_id) وممكن فروع تانية
 * تبيع/تشتري منه كمان (shared_branch_ids). مثال: فرع تاني مالوش مخزن بيستخدم مخزن الفرع الأول.
 */
export class SharedWarehouses1700000000034 implements MigrationInterface {
  name = 'SharedWarehouses1700000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS shared_branch_ids uuid[] NOT NULL DEFAULT '{}'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE warehouses DROP COLUMN IF EXISTS shared_branch_ids`);
  }
}
