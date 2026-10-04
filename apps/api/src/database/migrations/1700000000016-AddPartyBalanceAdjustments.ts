import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * يحفظ كل تعديل يدوي على الرصيد الافتتاحي للعميل أو المورد حتى يظهر في كشف الحساب
 * مع السبب، بدلاً من الكتابة فوق الرقم بدون أثر تدقيقي.
 */
export class AddPartyBalanceAdjustments1700000000016 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE party_balance_adjustments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        party_type VARCHAR(20) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
        customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
        supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
        amount DECIMAL(15, 4) NOT NULL,
        balance_before DECIMAL(15, 4) NOT NULL,
        balance_after DECIMAL(15, 4) NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        CONSTRAINT party_balance_adjustment_owner CHECK (
          (party_type = 'customer' AND customer_id IS NOT NULL AND supplier_id IS NULL)
          OR (party_type = 'supplier' AND supplier_id IS NOT NULL AND customer_id IS NULL)
        )
      );
      CREATE INDEX idx_party_balance_adjustments_customer
        ON party_balance_adjustments(tenant_id, customer_id, created_at);
      CREATE INDEX idx_party_balance_adjustments_supplier
        ON party_balance_adjustments(tenant_id, supplier_id, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS party_balance_adjustments;`);
  }
}
