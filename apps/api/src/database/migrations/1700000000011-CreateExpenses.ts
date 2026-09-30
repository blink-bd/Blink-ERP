import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExpenses1700000000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE expense_categories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_expense_category_per_tenant UNIQUE(tenant_id, name)
      );

      CREATE TABLE expenses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        expense_number VARCHAR(100) NOT NULL,
        category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        shift_id UUID REFERENCES cash_register_shifts(id) ON DELETE SET NULL,
        amount DECIMAL(15, 4) NOT NULL,
        expense_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description TEXT NOT NULL,
        notes TEXT,
        receipt_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'approved',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID NOT NULL,
        approved_at TIMESTAMP,
        approved_by UUID,
        CONSTRAINT unique_expense_number_per_tenant UNIQUE(tenant_id, expense_number),
        CONSTRAINT positive_expense_amount CHECK (amount > 0)
      );
      CREATE INDEX idx_expenses_tenant ON expenses(tenant_id);
      CREATE INDEX idx_expenses_date ON expenses(tenant_id, expense_date DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS expenses;
      DROP TABLE IF EXISTS expense_categories;
    `);
  }
}
