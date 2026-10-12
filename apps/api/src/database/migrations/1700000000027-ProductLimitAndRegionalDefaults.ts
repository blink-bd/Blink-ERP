import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - حد أقصى لعدد المنتجات لكل تاجر (max_products) يحدده المدير العام — NULL = بدون حد.
 * - القيم الافتراضية للتجار الجدد: مصر، توقيت القاهرة، والجنيه المصري (السوق الأساسي للنظام).
 *   التجار الحاليين ما بيتغيرلهمش حاجة؛ المدير العام يقدر يعدّل التوقيت/العملة لأي تاجر.
 *
 * آمنة للتكرار.
 */
export class ProductLimitAndRegionalDefaults1700000000027 implements MigrationInterface {
  name = 'ProductLimitAndRegionalDefaults1700000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_products INTEGER`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_max_products_positive') THEN
          ALTER TABLE tenants ADD CONSTRAINT tenants_max_products_positive
            CHECK (max_products IS NULL OR max_products > 0);
        END IF;
      END $$;
    `);
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN timezone SET DEFAULT 'Africa/Cairo'`);
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN currency SET DEFAULT 'EGP'`);
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN country SET DEFAULT 'Egypt'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN country SET DEFAULT 'Saudi Arabia'`);
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN currency SET DEFAULT 'SAR'`);
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN timezone SET DEFAULT 'Asia/Riyadh'`);
    await queryRunner.query(
      `ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_max_products_positive`
    );
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS max_products`);
  }
}
