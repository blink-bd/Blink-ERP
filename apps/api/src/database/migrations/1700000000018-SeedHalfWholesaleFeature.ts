import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedHalfWholesaleFeature1700000000018 implements MigrationInterface {
  name = 'SeedHalfWholesaleFeature1700000000018';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO features (code, name, name_ar, category, is_default, requires_plan, is_active)
      VALUES ('half_wholesale_pricing', 'Half Wholesale Pricing', 'تسعير نصف الجملة', 'sales', false, true, true)
      ON CONFLICT (code) DO NOTHING
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM features WHERE code = 'half_wholesale_pricing'`);
  }
}
