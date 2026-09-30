import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashRegisters1700000000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE cash_registers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        is_active BOOLEAN DEFAULT true,
        current_shift_id UUID,
        is_open BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        CONSTRAINT unique_register_code_per_tenant UNIQUE(tenant_id, code)
      );
      CREATE INDEX idx_cash_registers_tenant ON cash_registers(tenant_id);

      CREATE TABLE cash_register_shifts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        shift_number VARCHAR(100) NOT NULL,
        cash_register_id UUID NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP,
        opening_balance DECIMAL(15, 4) NOT NULL,
        opening_notes TEXT,
        expected_cash_sales DECIMAL(15, 4) DEFAULT 0,
        expected_card_sales DECIMAL(15, 4) DEFAULT 0,
        expected_other_sales DECIMAL(15, 4) DEFAULT 0,
        expected_total_sales DECIMAL(15, 4) DEFAULT 0,
        expected_expenses DECIMAL(15, 4) DEFAULT 0,
        expected_cash_in DECIMAL(15, 4) DEFAULT 0,
        expected_cash_out DECIMAL(15, 4) DEFAULT 0,
        expected_closing_balance DECIMAL(15, 4) DEFAULT 0,
        actual_cash DECIMAL(15, 4),
        actual_card DECIMAL(15, 4),
        actual_other DECIMAL(15, 4),
        closing_notes TEXT,
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_shift_number_per_tenant UNIQUE(tenant_id, shift_number)
      );
      CREATE INDEX idx_shifts_tenant ON cash_register_shifts(tenant_id);
      CREATE INDEX idx_shifts_register ON cash_register_shifts(cash_register_id);
      CREATE INDEX idx_shifts_status ON cash_register_shifts(tenant_id, status);

      CREATE TABLE cash_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        shift_id UUID NOT NULL REFERENCES cash_register_shifts(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 4) NOT NULL,
        reference_type VARCHAR(50),
        reference_id UUID,
        description TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID NOT NULL,
        CONSTRAINT positive_cash_amount CHECK (amount > 0)
      );
      CREATE INDEX idx_cash_txn_tenant ON cash_transactions(tenant_id);
      CREATE INDEX idx_cash_txn_shift ON cash_transactions(shift_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS cash_transactions;
      DROP TABLE IF EXISTS cash_register_shifts;
      DROP TABLE IF EXISTS cash_registers;
    `);
  }
}
