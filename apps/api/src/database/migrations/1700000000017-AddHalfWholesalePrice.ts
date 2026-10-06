import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ميزة "تسعير نصف الجملة" (half_wholesale_pricing):
 * بيضيف عمود half_wholesale_price لجدول المنتجات عشان يبقى فيه سعر تالت
 * بين سعر القطاعي وسعر الجملة، يظهر فقط للتجار اللي مفعّل عندهم Feature
 * باسم half_wholesale_pricing (شوف features.seed.ts).
 *
 * آمنة للتشغيل على بيئة الإنتاج: IF NOT EXISTS على كل خطوة حتى تقدر تتكرر
 * بدون ما تكسر قاعدة بيانات فيها بيانات فعلاً. الاسم الصريح name= أدناه
 * بيتطابق مع اسم الكلاس عشان أي قاعدة بيانات كانت اتّرحّلت فعلاً بنسخة
 * مبسّطة سابقة من نفس الملف (نفس اسم الكلاس) تفضل متوافقة ومتسجّلة صح في
 * جدول migrations، ومتعملش re-run أو تعارض.
 */
export class AddHalfWholesalePrice1700000000017 implements MigrationInterface {
  name = 'AddHalfWholesalePrice1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS half_wholesale_price DECIMAL(15, 4);
    `);

    // سعر نصف الجملة (لو موجود) لازم يكون أكبر من صفر؛ التحقق من إنه أكبر
    // من سعر التكلفة بيتم في طبقة التطبيق (ProductsService) لأنه محتاج رسالة
    // خطأ عربية واضحة للمستخدم، لكن بنحط حد أدنى هنا كخط دفاع إضافي.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'positive_half_wholesale_price'
        ) THEN
          ALTER TABLE products
          ADD CONSTRAINT positive_half_wholesale_price
          CHECK (half_wholesale_price IS NULL OR half_wholesale_price > 0);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_products_half_wholesale_price
      ON products(tenant_id)
      WHERE half_wholesale_price IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_products_half_wholesale_price;
      ALTER TABLE products DROP CONSTRAINT IF EXISTS positive_half_wholesale_price;
      ALTER TABLE products DROP COLUMN IF EXISTS half_wholesale_price;
    `);
  }
}
