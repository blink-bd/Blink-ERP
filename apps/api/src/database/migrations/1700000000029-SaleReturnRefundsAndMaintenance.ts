import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * تصحيح محاسبة المرتجعات + ربط صيانة المرتجع بإدارة الصيانة:
 *
 * sale_returns — كل مرتجع بيتقسم لثلاث أجزاء مجموعها = total:
 * - invoice_credit: الجزء اللي اتخصم من المتبقي (الآجل) على الفاتورة نفسها.
 * - refund_paid:    مبلغ اترد للعميل فعلاً (نقدي/كارت/تحويل) بطريقة refund_method_id.
 * - account_credit: مبلغ اتضاف رصيد لحساب العميل بدل ما يترد له فلوس.
 *
 * المرتجعات القديمة: invoice_credit بيتحسب بنفس المعادلة اللي كانت مطبقة فعلاً
 * على رصيد العميل وقتها، عشان المتبقي على الفواتير القديمة يفضل مطابق للرصيد.
 *
 * sale_return_items.waste_expense: هالك/فرق تقييم الصنف المرتجع (بيتسجل مصروف).
 *
 * maintenance_invoices.source / sale_return_id / sale_return_item_id:
 * صيانة الصنف المرتجع بتتسجل فاتورة صيانة داخلية (source = 'sale_return')
 * عشان تظهر في «إدارة الصيانة» وفي التقارير.
 *
 * آمنة للتكرار.
 */
export class SaleReturnRefundsAndMaintenance1700000000029 implements MigrationInterface {
  name = 'SaleReturnRefundsAndMaintenance1700000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [existing] = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'sale_returns' AND column_name = 'invoice_credit'`
    );
    await queryRunner.query(`
      ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS invoice_credit DECIMAL(15,4) NOT NULL DEFAULT 0;
      ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS refund_paid DECIMAL(15,4) NOT NULL DEFAULT 0;
      ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS account_credit DECIMAL(15,4) NOT NULL DEFAULT 0;
      ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS refund_method_id UUID;
      ALTER TABLE sale_return_items ADD COLUMN IF NOT EXISTS waste_expense DECIMAL(15,4) NOT NULL DEFAULT 0;
      ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'manual';
      ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS sale_return_id UUID;
      ALTER TABLE maintenance_invoices ADD COLUMN IF NOT EXISTS sale_return_item_id UUID;
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_sale_return_item
       ON maintenance_invoices(sale_return_item_id) WHERE sale_return_item_id IS NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_tenant_date ON sale_returns(tenant_id, return_date)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(tenant_id, original_sale_id)`
    );

    if (!existing) {
      // نفس منطق الكود القديم: الجزء الآجل = المتبقي على الفاتورة بعد خصم إجمالي
      // المرتجعات لحد المرتجع ده (شامل نفسه)، ولو مفيش عميل مكانش بيتخصم حاجة.
      await queryRunner.query(`
        UPDATE sale_returns r
        SET invoice_credit = LEAST(r.total, GREATEST(0, s.total - s.paid_amount - x.running))
        FROM (
          SELECT id, SUM(total) OVER (
            PARTITION BY original_sale_id ORDER BY created_at, id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running
          FROM sale_returns
        ) x, sales s
        WHERE x.id = r.id AND s.id = r.original_sale_id AND r.customer_id IS NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sale_returns_sale`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sale_returns_tenant_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_maintenance_sale_return_item`);
    await queryRunner.query(`
      ALTER TABLE maintenance_invoices DROP COLUMN IF EXISTS sale_return_item_id;
      ALTER TABLE maintenance_invoices DROP COLUMN IF EXISTS sale_return_id;
      ALTER TABLE maintenance_invoices DROP COLUMN IF EXISTS source;
      ALTER TABLE sale_return_items DROP COLUMN IF EXISTS waste_expense;
      ALTER TABLE sale_returns DROP COLUMN IF EXISTS refund_method_id;
      ALTER TABLE sale_returns DROP COLUMN IF EXISTS account_credit;
      ALTER TABLE sale_returns DROP COLUMN IF EXISTS refund_paid;
      ALTER TABLE sale_returns DROP COLUMN IF EXISTS invoice_credit;
    `);
  }
}
