import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApprovalsWebhooksAndReceipts1700000000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS receipt_token VARCHAR(64);
      UPDATE sales
      SET receipt_token = replace(uuid_generate_v4()::text, '-', '') || replace(uuid_generate_v4()::text, '-', '')
      WHERE receipt_token IS NULL;
      ALTER TABLE sales ALTER COLUMN receipt_token SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_receipt_token ON sales(receipt_token);

      CREATE TABLE inventory_transfers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        transfer_number VARCHAR(100) NOT NULL,
        source_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        destination_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        source_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        destination_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        notes TEXT,
        approved_by UUID,
        approved_at TIMESTAMP,
        rejected_by UUID,
        rejected_at TIMESTAMP,
        rejection_reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by UUID,
        updated_by UUID,
        CONSTRAINT unique_transfer_number_per_tenant UNIQUE(tenant_id, transfer_number),
        CONSTRAINT inventory_transfer_distinct_branches CHECK (source_branch_id <> destination_branch_id),
        CONSTRAINT inventory_transfer_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
      );
      CREATE INDEX idx_inventory_transfers_tenant_date
        ON inventory_transfers(tenant_id, created_at DESC);
      CREATE INDEX idx_inventory_transfers_status
        ON inventory_transfers(tenant_id, status, created_at DESC);

      CREATE TABLE inventory_transfer_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        transfer_id UUID NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity DECIMAL(15, 4) NOT NULL,
        unit_cost DECIMAL(15, 4),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        CONSTRAINT inventory_transfer_item_quantity_positive CHECK (quantity > 0)
      );
      CREATE INDEX idx_inventory_transfer_items_transfer ON inventory_transfer_items(transfer_id);
      CREATE INDEX idx_inventory_transfer_items_tenant ON inventory_transfer_items(tenant_id);

      CREATE TABLE webhook_endpoints (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        secret_ciphertext TEXT NOT NULL,
        events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by UUID,
        updated_by UUID
      );
      CREATE INDEX idx_webhook_endpoints_tenant
        ON webhook_endpoints(tenant_id, is_active) WHERE deleted_at IS NULL;

      CREATE TABLE webhook_deliveries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
        event_id UUID NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        http_status INTEGER,
        response_body TEXT,
        error_message TEXT,
        attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        CONSTRAINT webhook_delivery_status_check CHECK (status IN ('succeeded', 'failed'))
      );
      CREATE INDEX idx_webhook_deliveries_tenant_date
        ON webhook_deliveries(tenant_id, created_at DESC);
      CREATE INDEX idx_webhook_deliveries_endpoint_date
        ON webhook_deliveries(endpoint_id, created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS webhook_deliveries;
      DROP TABLE IF EXISTS webhook_endpoints;
      DROP TABLE IF EXISTS inventory_transfer_items;
      DROP TABLE IF EXISTS inventory_transfers;
      DROP INDEX IF EXISTS idx_sales_receipt_token;
      ALTER TABLE sales DROP COLUMN IF EXISTS receipt_token;
    `);
  }
}
