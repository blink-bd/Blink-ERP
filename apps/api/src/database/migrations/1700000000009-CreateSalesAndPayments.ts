import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSalesAndPayments1700000000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payment_methods (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        name_ar VARCHAR(100) NOT NULL,
        code VARCHAR(50) NOT NULL,
        requires_reference BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_payment_method_code_per_tenant UNIQUE(tenant_id, code)
      );
      CREATE INDEX idx_payment_methods_tenant ON payment_methods(tenant_id);

      CREATE TABLE sales (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        sale_number VARCHAR(100) NOT NULL,
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        cash_register_id UUID REFERENCES cash_registers(id) ON DELETE SET NULL,
        sale_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        due_date TIMESTAMP,
        subtotal DECIMAL(15, 4) NOT NULL,
        discount_amount DECIMAL(15, 4) DEFAULT 0,
        discount_percentage DECIMAL(5, 2) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        total DECIMAL(15, 4) NOT NULL,
        paid_amount DECIMAL(15, 4) DEFAULT 0,
        change_amount DECIMAL(15, 4) DEFAULT 0,
        remaining_amount DECIMAL(15, 4) GENERATED ALWAYS AS (total - paid_amount) STORED,
        payment_status VARCHAR(20) DEFAULT 'pending',
        cogs DECIMAL(15, 4) DEFAULT 0,
        gross_profit DECIMAL(15, 4) GENERATED ALWAYS AS (total - cogs) STORED,
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        internal_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID NOT NULL,
        updated_by UUID,
        voided_at TIMESTAMP,
        voided_by UUID,
        void_reason TEXT,
        CONSTRAINT unique_sale_number_per_tenant UNIQUE(tenant_id, sale_number),
        CONSTRAINT positive_total CHECK (total >= 0)
      );
      CREATE INDEX idx_sales_tenant ON sales(tenant_id);
      CREATE INDEX idx_sales_customer ON sales(customer_id);
      CREATE INDEX idx_sales_date ON sales(tenant_id, sale_date DESC);
      CREATE INDEX idx_sales_status ON sales(tenant_id, status);

      CREATE TABLE sale_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        product_name VARCHAR(500) NOT NULL,
        product_sku VARCHAR(100),
        product_barcode VARCHAR(100),
        quantity DECIMAL(15, 4) NOT NULL,
        unit VARCHAR(50),
        unit_price DECIMAL(15, 4) NOT NULL,
        discount_amount DECIMAL(15, 4) DEFAULT 0,
        tax_rate DECIMAL(5, 2) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        subtotal DECIMAL(15, 4) NOT NULL,
        total DECIMAL(15, 4) NOT NULL,
        unit_cost DECIMAL(15, 4) NOT NULL,
        total_cost DECIMAL(15, 4) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
        profit DECIMAL(15, 4) GENERATED ALWAYS AS (total - (quantity * unit_cost)) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT positive_quantity CHECK (quantity > 0)
      );
      CREATE INDEX idx_sale_items_tenant ON sale_items(tenant_id);
      CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

      CREATE TABLE sale_returns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        return_number VARCHAR(100) NOT NULL,
        original_sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        return_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        subtotal DECIMAL(15, 4) NOT NULL,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        total DECIMAL(15, 4) NOT NULL,
        refund_amount DECIMAL(15, 4) DEFAULT 0,
        cogs_adjustment DECIMAL(15, 4) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'completed',
        reason VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID NOT NULL,
        CONSTRAINT unique_return_number_per_tenant UNIQUE(tenant_id, return_number)
      );
      CREATE INDEX idx_sale_returns_tenant ON sale_returns(tenant_id);
      CREATE INDEX idx_sale_returns_sale ON sale_returns(original_sale_id);

      CREATE TABLE sale_return_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        return_id UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
        sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity DECIMAL(15, 4) NOT NULL,
        unit_price DECIMAL(15, 4) NOT NULL,
        tax_rate DECIMAL(5, 2) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        total DECIMAL(15, 4) NOT NULL,
        unit_cost DECIMAL(15, 4) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT positive_return_quantity CHECK (quantity > 0)
      );
      CREATE INDEX idx_sale_return_items_return ON sale_return_items(return_id);

      CREATE TABLE payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        payment_number VARCHAR(100) NOT NULL,
        sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
        payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
        amount DECIMAL(15, 4) NOT NULL,
        payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reference_number VARCHAR(255),
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID NOT NULL,
        cancelled_at TIMESTAMP,
        cancelled_by UUID,
        cancel_reason TEXT,
        CONSTRAINT unique_payment_number_per_tenant UNIQUE(tenant_id, payment_number),
        CONSTRAINT positive_amount CHECK (amount > 0)
      );
      CREATE INDEX idx_payments_tenant ON payments(tenant_id);
      CREATE INDEX idx_payments_sale ON payments(sale_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS payments;
      DROP TABLE IF EXISTS sale_return_items;
      DROP TABLE IF EXISTS sale_returns;
      DROP TABLE IF EXISTS sale_items;
      DROP TABLE IF EXISTS sales;
      DROP TABLE IF EXISTS payment_methods;
    `);
  }
}
