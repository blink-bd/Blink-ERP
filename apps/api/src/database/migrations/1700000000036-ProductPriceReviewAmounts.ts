import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * تنبيه مراجعة التسعير كان بيتسجل كنص ملاحظات بس، فالتاجر مايقدرش يقارن السعرين أو
 * يختار يشتغل على أنهي تكلفة. دلوقتي بنخزن السعر السابق والجديد كأرقام + رقم فاتورة
 * الشراء وتاريخ التنبيه، عشان الواجهة تعرضهم وتدي التاجر اختيار (السابق/الجديد) ويعدّل
 * القطاعي والجملة والنصف جملة ويحفظ.
 */
export class ProductPriceReviewAmounts1700000000036 implements MigrationInterface {
  name = 'ProductPriceReviewAmounts1700000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS price_review_previous_cost NUMERIC(15, 4),
        ADD COLUMN IF NOT EXISTS price_review_new_cost NUMERIC(15, 4),
        ADD COLUMN IF NOT EXISTS price_review_purchase_number VARCHAR(50),
        ADD COLUMN IF NOT EXISTS price_review_at TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products
        DROP COLUMN IF EXISTS price_review_previous_cost,
        DROP COLUMN IF EXISTS price_review_new_cost,
        DROP COLUMN IF EXISTS price_review_purchase_number,
        DROP COLUMN IF EXISTS price_review_at
    `);
  }
}
