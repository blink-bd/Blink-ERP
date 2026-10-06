import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * المدير العام مش هيختار "خطة" جاهزة للتاجر، هو هيكتب بنفسه مبلغ البيع
 * (شهري أو سنوي) وملحوظة توضح المبلغ ده بتاع إيه، بدل الاعتماد على خطط ثابتة.
 */
export class AddTenantSubscriptionAmount1700000000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS subscription_amount DECIMAL(15, 4),
        ADD COLUMN IF NOT EXISTS subscription_cycle VARCHAR(20),
        ADD COLUMN IF NOT EXISTS subscription_note TEXT;
    `);
    await queryRunner.query(`
      ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_cycle_check;
    `);
    await queryRunner.query(`
      ALTER TABLE tenants
        ADD CONSTRAINT tenants_subscription_cycle_check
        CHECK (subscription_cycle IS NULL OR subscription_cycle IN ('monthly', 'yearly'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_cycle_check;
    `);
    await queryRunner.query(`
      ALTER TABLE tenants
        DROP COLUMN IF EXISTS subscription_amount,
        DROP COLUMN IF EXISTS subscription_cycle,
        DROP COLUMN IF EXISTS subscription_note;
    `);
  }
}
