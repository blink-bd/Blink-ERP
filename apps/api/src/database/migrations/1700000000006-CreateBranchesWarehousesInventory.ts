import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranchesWarehousesInventory1700000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE branches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        is_main BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        updated_by UUID,
        deleted_at TIMESTAMP,
        CONSTRAINT unique_branch_code_per_tenant UNIQUE(tenant_id, code)
      );
      CREATE INDEX idx_branches_tenant ON branches(tenant_id);

      CREATE TABLE warehouses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        address TEXT,
        is_main BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        updated_by UUID,
        deleted_at TIMESTAMP,
        CONSTRAINT unique_warehouse_code_per_tenant UNIQUE(tenant_id, code)
      );
      CREATE INDEX idx_warehouses_tenant ON warehouses(tenant_id);
      CREATE INDEX idx_warehouses_branch ON warehouses(branch_id);

      CREATE TABLE inventory (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        quantity DECIMAL(15, 4) DEFAULT 0,
        reserved_quantity DECIMAL(15, 4) DEFAULT 0,
        available_quantity DECIMAL(15, 4) GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
        weighted_avg_cost DECIMAL(15, 4) DEFAULT 0,
        last_cost DECIMAL(15, 4) DEFAULT 0,
        version INTEGER DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_product_warehouse UNIQUE(tenant_id, product_id, warehouse_id),
        CONSTRAINT non_negative_quantity CHECK (quantity >= 0),
        CONSTRAINT non_negative_reserved CHECK (reserved_quantity >= 0)
      );
      CREATE INDEX idx_inventory_tenant ON inventory(tenant_id);
      CREATE INDEX idx_inventory_product ON inventory(product_id);
      CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);

      CREATE TABLE inventory_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        quantity DECIMAL(15, 4) NOT NULL,
        unit_cost DECIMAL(15, 4),
        balance_after DECIMAL(15, 4) NOT NULL,
        reference_type VARCHAR(50),
        reference_id UUID,
        reference_number VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID
      );
      CREATE INDEX idx_inventory_txn_tenant ON inventory_transactions(tenant_id);
      CREATE INDEX idx_inventory_txn_product ON inventory_transactions(product_id);
      CREATE INDEX idx_inventory_txn_date ON inventory_transactions(tenant_id, created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS inventory_transactions;
      DROP TABLE IF EXISTS inventory;
      DROP TABLE IF EXISTS warehouses;
      DROP TABLE IF EXISTS branches;
    `);
  }
}
