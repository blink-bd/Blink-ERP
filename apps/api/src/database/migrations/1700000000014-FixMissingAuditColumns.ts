import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * إصلاح: عدة Entities بترث من BaseEntity (وبالتالي بتفترض وجود عمودي
 * updated_at و deleted_at)، لكن الـ migrations الأصلية بتاعتها اتكتبت
 * من غير العمودين دول في بعض الجداول. ده بيسبب خطأ فعلي
 * "column X.updated_at does not exist" أول ما يتم الاستعلام عن الجدول
 * (زي ما ظهر فعليًا في صفحة المصروفات).
 *
 * الإصلاح: إضافة العمودين الناقصين لكل جدول متأثر، بأمان (IF NOT EXISTS)
 * بحيث الـ migration يشتغل حتى لو جزء من الأعمدة موجود بالفعل.
 */
export class FixMissingAuditColumns1700000000014 implements MigrationInterface {
  private readonly tables = [
    // جدول: [يحتاج updated_at?, يحتاج deleted_at?]
    { name: 'permissions', updatedAt: true, deletedAt: true },
    { name: 'features', updatedAt: false, deletedAt: true },
    { name: 'tenant_features', updatedAt: false, deletedAt: true },
    { name: 'plans', updatedAt: false, deletedAt: true },
    { name: 'payment_methods', updatedAt: false, deletedAt: true },
    { name: 'sales', updatedAt: false, deletedAt: true },
    { name: 'payments', updatedAt: true, deletedAt: true },
    { name: 'purchases', updatedAt: false, deletedAt: true },
    { name: 'cash_registers', updatedAt: false, deletedAt: true },
    { name: 'expenses', updatedAt: true, deletedAt: true },
    { name: 'expense_categories', updatedAt: false, deletedAt: true },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.tables) {
      if (t.updatedAt) {
        await queryRunner.query(`
          ALTER TABLE ${t.name}
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);
      }
      if (t.deletedAt) {
        await queryRunner.query(`
          ALTER TABLE ${t.name}
          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.tables) {
      if (t.updatedAt) {
        await queryRunner.query(`ALTER TABLE ${t.name} DROP COLUMN IF EXISTS updated_at;`);
      }
      if (t.deletedAt) {
        await queryRunner.query(`ALTER TABLE ${t.name} DROP COLUMN IF EXISTS deleted_at;`);
      }
    }
  }
}
