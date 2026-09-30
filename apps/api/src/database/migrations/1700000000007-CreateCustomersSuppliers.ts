import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomersSuppliers1700000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE customers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        credit_limit DECIMAL(15, 4) DEFAULT 0,
        balance DECIMAL(15, 4) DEFAULT 0,
        customer_type VARCHAR(50) DEFAULT 'retail',
        price_tier VARCHAR(50) DEFAULT 'retail',
        tax_number VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        updated_by UUID,
        deleted_at TIMESTAMP,
        CONSTRAINT unique_customer_code_per_tenant UNIQUE(tenant_id, code)
      );
      CREATE INDEX idx_customers_tenant ON customers(tenant_id);
      CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);

      CREATE TABLE suppliers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        contact_person VARCHAR(255),
        balance DECIMAL(15, 4) DEFAULT 0,
        tax_number VARCHAR(100),
        payment_terms VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        updated_by UUID,
        deleted_at TIMESTAMP,
        CONSTRAINT unique_supplier_code_per_tenant UNIQUE(tenant_id, code)
      );
      CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS suppliers;
      DROP TABLE IF EXISTS customers;
    `);
  }
}
