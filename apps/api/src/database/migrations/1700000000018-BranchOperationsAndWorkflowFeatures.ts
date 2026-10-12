import { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchOperationsAndWorkflowFeatures1700000000018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Give every existing tenant a main branch before backfilling legacy records.
      UPDATE branches b
      SET is_main = true
      WHERE b.id = (
        SELECT candidate.id
        FROM branches candidate
        WHERE candidate.tenant_id = b.tenant_id AND candidate.deleted_at IS NULL
        ORDER BY candidate.is_main DESC, candidate.created_at ASC
        LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM branches main
        WHERE main.tenant_id = b.tenant_id AND main.is_main = true AND main.deleted_at IS NULL
      );

      INSERT INTO branches (id, tenant_id, name, code, is_main, is_active, created_at, updated_at)
      SELECT uuid_generate_v4(), t.id, 'الفرع الرئيسي', 'MAIN-' || LEFT(t.id::text, 8), true, true,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM tenants t
      WHERE t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM branches b
          WHERE b.tenant_id = t.id AND b.is_main = true AND b.deleted_at IS NULL
        );

      INSERT INTO warehouses (id, tenant_id, branch_id, name, is_main, is_active, created_at, updated_at)
      SELECT uuid_generate_v4(), t.id, b.id, 'المخزن الرئيسي', true, true,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM tenants t
      JOIN branches b ON b.tenant_id = t.id AND b.is_main = true AND b.deleted_at IS NULL
      WHERE t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM warehouses w
          WHERE w.tenant_id = t.id AND w.is_main = true AND w.deleted_at IS NULL
        );

      UPDATE warehouses w
      SET branch_id = b.id, updated_at = CURRENT_TIMESTAMP
      FROM branches b
      WHERE b.tenant_id = w.tenant_id AND b.is_main = true AND b.deleted_at IS NULL
        AND w.branch_id IS NULL AND w.deleted_at IS NULL;

      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
      ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
      ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS balance_reminder_anchor_at TIMESTAMP;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS balance_reminder_last_sent_at TIMESTAMP;
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS balance_reminder_anchor_at TIMESTAMP;
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS balance_reminder_last_sent_at TIMESTAMP;
      ALTER TABLE party_balance_adjustments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

      UPDATE sales s
      SET branch_id = COALESCE(
        (SELECT w.branch_id FROM warehouses w WHERE w.id = s.warehouse_id AND w.tenant_id = s.tenant_id),
        (SELECT b.id FROM branches b WHERE b.tenant_id = s.tenant_id AND b.is_main = true AND b.deleted_at IS NULL LIMIT 1)
      ), updated_at = CURRENT_TIMESTAMP
      WHERE s.branch_id IS NULL;

      UPDATE purchases p
      SET branch_id = COALESCE(
        (SELECT w.branch_id FROM warehouses w WHERE w.id = p.warehouse_id AND w.tenant_id = p.tenant_id),
        (SELECT b.id FROM branches b WHERE b.tenant_id = p.tenant_id AND b.is_main = true AND b.deleted_at IS NULL LIMIT 1)
      ), updated_at = CURRENT_TIMESTAMP
      WHERE p.branch_id IS NULL;

      UPDATE expenses e SET branch_id = b.id, updated_at = CURRENT_TIMESTAMP
      FROM branches b
      WHERE b.tenant_id = e.tenant_id AND b.is_main = true AND b.deleted_at IS NULL
        AND e.branch_id IS NULL;

      UPDATE cash_registers c SET branch_id = b.id, updated_at = CURRENT_TIMESTAMP
      FROM branches b
      WHERE b.tenant_id = c.tenant_id AND b.is_main = true AND b.deleted_at IS NULL
        AND c.branch_id IS NULL;

      UPDATE payments p
      SET branch_id = COALESCE(
        (SELECT s.branch_id FROM sales s WHERE s.id = p.sale_id AND s.tenant_id = p.tenant_id),
        (SELECT u.branch_id FROM users u WHERE u.id = p.created_by AND u.tenant_id = p.tenant_id),
        (SELECT b.id FROM branches b WHERE b.tenant_id = p.tenant_id AND b.is_main = true AND b.deleted_at IS NULL LIMIT 1)
      ), updated_at = CURRENT_TIMESTAMP
      WHERE p.branch_id IS NULL;

      UPDATE supplier_payments sp
      SET branch_id = COALESCE(
        (SELECT u.branch_id FROM users u WHERE u.id = sp.created_by AND u.tenant_id = sp.tenant_id),
        (SELECT b.id FROM branches b WHERE b.tenant_id = sp.tenant_id AND b.is_main = true AND b.deleted_at IS NULL LIMIT 1)
      )
      WHERE sp.branch_id IS NULL;

      UPDATE sale_returns r
      SET branch_id = COALESCE(
        (SELECT s.branch_id FROM sales s WHERE s.id = r.original_sale_id AND s.tenant_id = r.tenant_id),
        (SELECT b.id FROM branches b WHERE b.tenant_id = r.tenant_id AND b.is_main = true AND b.deleted_at IS NULL LIMIT 1)
      )
      WHERE r.branch_id IS NULL;

      UPDATE party_balance_adjustments a
      SET branch_id = b.id
      FROM branches b
      WHERE b.tenant_id = a.tenant_id AND b.is_main = true AND b.deleted_at IS NULL
        AND a.branch_id IS NULL;

      CREATE TABLE IF NOT EXISTS branch_party_balances (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        party_type VARCHAR(20) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
        party_id UUID NOT NULL,
        balance DECIMAL(15, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_branch_party_balance UNIQUE (tenant_id, branch_id, party_type, party_id)
      );
      CREATE INDEX IF NOT EXISTS idx_branch_party_balances_lookup
        ON branch_party_balances(tenant_id, branch_id, party_type);

      -- Existing account balances are assigned to the main branch as requested.
      INSERT INTO branch_party_balances (tenant_id, branch_id, party_type, party_id, balance)
      SELECT c.tenant_id, b.id, 'customer', c.id, c.balance
      FROM customers c
      JOIN branches b ON b.tenant_id = c.tenant_id AND b.is_main = true AND b.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      ON CONFLICT (tenant_id, branch_id, party_type, party_id) DO NOTHING;

      INSERT INTO branch_party_balances (tenant_id, branch_id, party_type, party_id, balance)
      SELECT s.tenant_id, b.id, 'supplier', s.id, s.balance
      FROM suppliers s
      JOIN branches b ON b.tenant_id = s.tenant_id AND b.is_main = true AND b.deleted_at IS NULL
      WHERE s.deleted_at IS NULL
      ON CONFLICT (tenant_id, branch_id, party_type, party_id) DO NOTHING;

      UPDATE customers SET balance_reminder_anchor_at = COALESCE(balance_reminder_anchor_at, updated_at, created_at)
      WHERE balance <> 0;
      UPDATE suppliers SET balance_reminder_anchor_at = COALESCE(balance_reminder_anchor_at, updated_at, created_at)
      WHERE balance <> 0;

      ALTER TABLE sale_returns ALTER COLUMN status SET DEFAULT 'pending_inspection';
      ALTER TABLE sale_return_items ADD COLUMN IF NOT EXISTS disposition VARCHAR(20) NOT NULL DEFAULT 'pending';
      ALTER TABLE sale_return_items ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
      ALTER TABLE sale_return_items ADD COLUMN IF NOT EXISTS new_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
      ALTER TABLE sale_return_items ADD COLUMN IF NOT EXISTS repair_expense DECIMAL(15, 4) NOT NULL DEFAULT 0;
      ALTER TABLE sale_return_items ADD CONSTRAINT sale_return_item_disposition_check
        CHECK (disposition IN ('pending', 'supplier', 'restocked'));

      CREATE TABLE IF NOT EXISTS invoice_attachments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('sale', 'purchase')),
        entity_id UUID NOT NULL,
        object_key TEXT NOT NULL,
        storage_provider VARCHAR(20) NOT NULL CHECK (storage_provider IN ('s3', 'local', 'database')),
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
        content BYTEA NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by UUID
      );
      CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice
        ON invoice_attachments(tenant_id, entity_type, entity_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS balance_reminder_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        party_type VARCHAR(20) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
        party_id UUID NOT NULL,
        party_name VARCHAR(255) NOT NULL,
        balance DECIMAL(15, 4) NOT NULL,
        reminder_days INTEGER NOT NULL CHECK (reminder_days > 0),
        due_at TIMESTAMP NOT NULL,
        notified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        email_status VARCHAR(20) NOT NULL DEFAULT 'skipped',
        whatsapp_status VARCHAR(20) NOT NULL DEFAULT 'skipped',
        snoozed_at TIMESTAMP,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_balance_reminder_events_active
        ON balance_reminder_events(tenant_id, resolved_at, notified_at DESC);

      CREATE TABLE IF NOT EXISTS supplier_returns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        sale_return_id UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
        sale_return_item_id UUID NOT NULL UNIQUE REFERENCES sale_return_items(id) ON DELETE CASCADE,
        quantity DECIMAL(15, 4) NOT NULL CHECK (quantity > 0),
        unit_cost DECIMAL(15, 4) NOT NULL CHECK (unit_cost >= 0),
        amount DECIMAL(15, 4) NOT NULL CHECK (amount >= 0),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by UUID
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_returns_account
        ON supplier_returns(tenant_id, supplier_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS supplier_payables_limit_states (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        is_over_limit BOOLEAN NOT NULL DEFAULT false,
        total_payables DECIMAL(15, 4) NOT NULL DEFAULT 0,
        limit_amount DECIMAL(15, 4) NOT NULL DEFAULT 0,
        email_status VARCHAR(20) NOT NULL DEFAULT 'skipped',
        whatsapp_status VARCHAR(20) NOT NULL DEFAULT 'skipped',
        last_notified_at TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS maintenance_invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        invoice_number VARCHAR(100) NOT NULL,
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        customer_email VARCHAR(255),
        product_name VARCHAR(500) NOT NULL,
        product_model VARCHAR(255),
        product_serial VARCHAR(255),
        product_notes TEXT,
        maintenance_description TEXT NOT NULL,
        parts_description TEXT,
        parts_cost DECIMAL(15, 4) NOT NULL DEFAULT 0 CHECK (parts_cost >= 0),
        service_price DECIMAL(15, 4) NOT NULL DEFAULT 0 CHECK (service_price >= 0),
        profit DECIMAL(15, 4) GENERATED ALWAYS AS (service_price - parts_cost) STORED,
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        maintenance_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        CONSTRAINT unique_maintenance_invoice_per_tenant UNIQUE (tenant_id, invoice_number)
      );
      CREATE INDEX IF NOT EXISTS idx_maintenance_invoices_branch_date
        ON maintenance_invoices(tenant_id, branch_id, maintenance_date DESC);

      INSERT INTO features (id, code, name, name_ar, category, module, is_default, is_core, requires_plan, is_active, sort_order)
      VALUES
        (uuid_generate_v4(), 'branch_analytics', 'Branch Analytics', 'تقارير الفروع وحساباتها', 'advanced', 'reports', false, false, false, true, 21),
        (uuid_generate_v4(), 'return_disposition', 'Return Inspection and Disposition', 'فحص ومعالجة المرتجعات', 'sales', 'sales', false, false, false, true, 22),
        (uuid_generate_v4(), 'balance_reminders', 'Customer and Supplier Balance Reminders', 'تنبيهات أرصدة العملاء والموردين', 'accounting', 'notifications', false, false, false, true, 23),
        (uuid_generate_v4(), 'invoice_attachments', 'Invoice Evidence Attachments', 'مرفقات إثبات الفواتير', 'accounting', 'sales', false, false, false, true, 24),
        (uuid_generate_v4(), 'supplier_balance_limit', 'Supplier Payables Limit Alert', 'تنبيه حد أرصدة الموردين', 'accounting', 'notifications', false, false, false, true, 25),
        (uuid_generate_v4(), 'maintenance_management', 'Maintenance Management', 'إدارة الصيانة وفواتيرها', 'sales', 'maintenance', false, false, false, true, 26)
      ON CONFLICT (code) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM features WHERE code IN (
        'branch_analytics', 'return_disposition', 'balance_reminders', 'invoice_attachments',
        'supplier_balance_limit', 'maintenance_management'
      );
      DROP TABLE IF EXISTS maintenance_invoices;
      DROP TABLE IF EXISTS supplier_payables_limit_states;
      DROP TABLE IF EXISTS supplier_returns;
      DROP TABLE IF EXISTS balance_reminder_events;
      DROP TABLE IF EXISTS invoice_attachments;
      ALTER TABLE sale_return_items DROP CONSTRAINT IF EXISTS sale_return_item_disposition_check;
      ALTER TABLE sale_return_items DROP COLUMN IF EXISTS repair_expense;
      ALTER TABLE sale_return_items DROP COLUMN IF EXISTS new_product_id;
      ALTER TABLE sale_return_items DROP COLUMN IF EXISTS supplier_id;
      ALTER TABLE sale_return_items DROP COLUMN IF EXISTS disposition;
      ALTER TABLE sale_returns ALTER COLUMN status SET DEFAULT 'completed';
      DROP TABLE IF EXISTS branch_party_balances;
      ALTER TABLE suppliers DROP COLUMN IF EXISTS balance_reminder_last_sent_at;
      ALTER TABLE suppliers DROP COLUMN IF EXISTS balance_reminder_anchor_at;
      ALTER TABLE customers DROP COLUMN IF EXISTS balance_reminder_last_sent_at;
      ALTER TABLE customers DROP COLUMN IF EXISTS balance_reminder_anchor_at;
      ALTER TABLE sale_returns DROP COLUMN IF EXISTS branch_id;
      ALTER TABLE supplier_payments DROP COLUMN IF EXISTS branch_id;
      ALTER TABLE payments DROP COLUMN IF EXISTS branch_id;
      ALTER TABLE purchases DROP COLUMN IF EXISTS branch_id;
      ALTER TABLE party_balance_adjustments DROP COLUMN IF EXISTS branch_id;
    `);
  }
}
