import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * إصلاح قيد positive_total على جدول sales:
 * يضمن القيد أن إجمالي الفاتورة لا يقل عن صفر (total >= 0)
 * بما يسمح باسترجاع كامل الفاتورة والوصول إلى إجمالي 0 دون حدوث خطأ في قيد قاعدة البيانات.
 */
export class FixSalesPositiveTotalConstraint1700000000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales DROP CONSTRAINT IF EXISTS positive_total;
      ALTER TABLE sales ADD CONSTRAINT positive_total CHECK (total >= 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales DROP CONSTRAINT IF EXISTS positive_total;
      ALTER TABLE sales ADD CONSTRAINT positive_total CHECK (total >= 0);
    `);
  }
}
