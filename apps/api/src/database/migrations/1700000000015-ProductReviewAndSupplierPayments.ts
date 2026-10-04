import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductReviewAndSupplierPayments1700000000015 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS needs_price_review BOOLEAN DEFAULT false;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS price_review_note TEXT;

      CREATE TABLE IF NOT EXISTS supplier_payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        amount DECIMAL(15, 4) NOT NULL,
        method VARCHAR(50) NOT NULL DEFAULT 'cash',
        reference_number VARCHAR(255),
        notes TEXT,
        payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        CONSTRAINT positive_supplier_payment CHECK (amount > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant ON supplier_payments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);

      ALTER TABLE customers ADD COLUMN IF NOT EXISTS previous_balance DECIMAL(15,4) DEFAULT 0;
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS previous_balance DECIMAL(15,4) DEFAULT 0;

      ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS warehouse_id UUID;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS supplier_payments;
      ALTER TABLE products DROP COLUMN IF EXISTS needs_price_review;
      ALTER TABLE products DROP COLUMN IF EXISTS price_review_note;
      ALTER TABLE customers DROP COLUMN IF EXISTS previous_balance;
      ALTER TABLE suppliers DROP COLUMN IF EXISTS previous_balance;
      ALTER TABLE cash_registers DROP COLUMN IF EXISTS warehouse_id;
    `);
  }
}
