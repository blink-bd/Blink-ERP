import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePurchases1700000000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE purchases (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        purchase_number VARCHAR(100) NOT NULL,
        supplier_invoice_number VARCHAR(100),
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        purchase_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        due_date TIMESTAMP,
        subtotal DECIMAL(15, 4) NOT NULL,
        discount_amount DECIMAL(15, 4) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        shipping_cost DECIMAL(15, 4) DEFAULT 0,
        other_costs DECIMAL(15, 4) DEFAULT 0,
        total DECIMAL(15, 4) NOT NULL,
        paid_amount DECIMAL(15, 4) DEFAULT 0,
        remaining_amount DECIMAL(15, 4) GENERATED ALWAYS AS (total - paid_amount) STORED,
        payment_status VARCHAR(20) DEFAULT 'pending',
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID NOT NULL,
        updated_by UUID,
        CONSTRAINT unique_purchase_number_per_tenant UNIQUE(tenant_id, purchase_number)
      );
      CREATE INDEX idx_purchases_tenant ON purchases(tenant_id);
      CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);

      CREATE TABLE purchase_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity DECIMAL(15, 4) NOT NULL,
        unit_cost DECIMAL(15, 4) NOT NULL,
        discount_amount DECIMAL(15, 4) DEFAULT 0,
        tax_rate DECIMAL(5, 2) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        total DECIMAL(15, 4) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT positive_purchase_quantity CHECK (quantity > 0)
      );
      CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS purchase_items;
      DROP TABLE IF EXISTS purchases;
    `);
  }
}
