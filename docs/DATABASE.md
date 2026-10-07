# Database Schema Design

## Database Technology
- **Production**: PostgreSQL 15+
- **Application database**: PostgreSQL 15+
- **ORM**: TypeORM

---

## Design Principles

1. **Multi-Tenancy First**: Every tenant-scoped table includes `tenant_id`
2. **UUID Primary Keys**: For distributed ID generation
3. **Audit Fields**: All tables have created/updated timestamps and actors
4. **Soft Deletes**: Important entities support soft delete
5. **Referential Integrity**: Foreign keys with appropriate cascade rules
6. **Normalization**: Properly normalized to 3NF
7. **Indexing**: Strategic indexes for performance
8. **Arabic Support**: UTF-8 encoding, Arabic text search

---

## Core Tables

### tenants
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(255) NOT NULL,
  business_name_ar VARCHAR(255) NOT NULL,
  business_name_en VARCHAR(255),
  trade_name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Saudi Arabia',
  currency VARCHAR(3) DEFAULT 'SAR',
  timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
  default_language VARCHAR(5) DEFAULT 'ar',
  plan_id UUID REFERENCES plans(id),
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,
  subscription_status VARCHAR(20) DEFAULT 'active',
  trial_ends_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMP,
  CONSTRAINT valid_subscription_dates CHECK (
    subscription_end_date IS NULL OR
    subscription_end_date > subscription_start_date
  )
);

CREATE INDEX idx_tenants_email ON tenants(email);
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_subscription_status ON tenants(subscription_status);
```

### tenant_branding
```sql
CREATE TABLE tenant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  app_name VARCHAR(255) DEFAULT 'نظام نقاط البيع',
  logo_url VARCHAR(500),
  logo_light_url VARCHAR(500),
  logo_dark_url VARCHAR(500),
  favicon_url VARCHAR(500),
  primary_color VARCHAR(7) DEFAULT '#0858A2',
  primary_dark_color VARCHAR(7),
  primary_light_color VARCHAR(7),
  secondary_color VARCHAR(7),
  accent_color VARCHAR(7),
  background_color VARCHAR(7),
  surface_color VARCHAR(7),
  sidebar_color VARCHAR(7),
  header_color VARCHAR(7),
  font_family VARCHAR(100) DEFAULT 'Cairo, sans-serif',
  invoice_template VARCHAR(50) DEFAULT 'modern',
  invoice_header_color VARCHAR(7),
  invoice_show_logo BOOLEAN DEFAULT true,
  login_background_url VARCHAR(500),
  login_background_color VARCHAR(7),
  login_position VARCHAR(20) DEFAULT 'center',
  custom_css TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID
);

CREATE INDEX idx_tenant_branding_tenant ON tenant_branding(tenant_id);
```

---

## User Management

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMP,
  last_login_at TIMESTAMP,
  last_login_ip VARCHAR(45),
  password_changed_at TIMESTAMP,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMP,
  CONSTRAINT unique_email_per_tenant UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_users_active ON users(tenant_id, is_active) WHERE deleted_at IS NULL;
```

### roles
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMP,
  CONSTRAINT unique_role_name_per_tenant UNIQUE(tenant_id, name)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
```

### permissions
```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  scope VARCHAR(20) DEFAULT 'all',
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500),
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_permission_name UNIQUE(name),
  CONSTRAINT unique_resource_action_scope UNIQUE(resource, action, scope)
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_category ON permissions(category);

INSERT INTO permissions (name, resource, action, scope, description, category) VALUES
('sales.view', 'sales', 'view', 'all', 'View sales', 'sales'),
('sales.create', 'sales', 'create', 'all', 'Create sales', 'sales'),
('sales.update', 'sales', 'update', 'all', 'Update sales', 'sales'),
('sales.delete', 'sales', 'delete', 'all', 'Delete sales', 'sales'),
('sales.return', 'sales', 'return', 'all', 'Process returns', 'sales'),
('products.view', 'products', 'view', 'all', 'View products', 'products'),
('products.create', 'products', 'create', 'all', 'Create products', 'products'),
('products.update', 'products', 'update', 'all', 'Update products', 'products'),
('products.delete', 'products', 'delete', 'all', 'Delete products', 'products'),
('inventory.view', 'inventory', 'view', 'all', 'View inventory', 'inventory'),
('inventory.adjust', 'inventory', 'adjust', 'all', 'Adjust inventory', 'inventory'),
('reports.view', 'reports', 'view', 'all', 'View reports', 'reports'),
('reports.export', 'reports', 'export', 'all', 'Export reports', 'reports'),
('settings.view', 'settings', 'view', 'all', 'View settings', 'settings'),
('settings.update', 'settings', 'update', 'all', 'Update settings', 'settings');
```

### role_permissions
```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by UUID,
  CONSTRAINT unique_role_permission UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);
```

### user_roles
```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by UUID,
  CONSTRAINT unique_user_role UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
```

### user_permissions
```sql
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by UUID,
  CONSTRAINT unique_user_permission UNIQUE(user_id, permission_id)
);

CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_permission ON user_permissions(permission_id);
```

---

## Feature Management

### features
```sql
CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  description TEXT,
  description_ar TEXT,
  category VARCHAR(50),
  depends_on UUID[] DEFAULT ARRAY[]::UUID[],
  is_default BOOLEAN DEFAULT false,
  requires_plan BOOLEAN DEFAULT false,
  icon VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_features_code ON features(code);
CREATE INDEX idx_features_category ON features(category);

INSERT INTO features (code, name, name_ar, category, is_default) VALUES
('pos', 'Point of Sale', 'نقطة البيع', 'core', true),
('sales', 'Sales Management', 'إدارة المبيعات', 'sales', true),
('products', 'Product Catalog', 'كتالوج المنتجات', 'core', true),
('inventory', 'Inventory Management', 'إدارة المخزون', 'inventory', true),
('customers', 'Customer Management', 'إدارة العملاء', 'sales', true),
('suppliers', 'Supplier Management', 'إدارة الموردين', 'purchases', true),
('purchases', 'Purchase Management', 'إدارة المشتريات', 'purchases', true),
('expenses', 'Expense Tracking', 'تتبع المصروفات', 'accounting', true),
('cash_register', 'Cash Register', 'إدارة الخزينة', 'sales', true),
('returns', 'Returns Management', 'إدارة المرتجعات', 'sales', true),
('reports', 'Basic Reports', 'التقارير الأساسية', 'reports', true),
('advanced_reports', 'Advanced Reports', 'التقارير المتقدمة', 'reports', false),
('branches', 'Multi-Branch', 'الفروع المتعددة', 'advanced', false),
('warehouses', 'Multi-Warehouse', 'المخازن المتعددة', 'advanced', false),
('barcode_printing', 'Barcode Printing', 'طباعة الباركود', 'advanced', false),
('import_export', 'Data Import/Export', 'استيراد/تصدير البيانات', 'tools', false),
('api_access', 'API Access', 'الوصول عبر API', 'integrations', false);
```

### tenant_features
```sql
CREATE TABLE tenant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb,
  enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  enabled_by UUID,
  disabled_at TIMESTAMP,
  disabled_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_tenant_feature UNIQUE(tenant_id, feature_id)
);

CREATE INDEX idx_tenant_features_tenant ON tenant_features(tenant_id);
CREATE INDEX idx_tenant_features_feature ON tenant_features(feature_id);
CREATE INDEX idx_tenant_features_enabled ON tenant_features(tenant_id, is_enabled);
```

### plans
```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  name_ar VARCHAR(100) NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10, 2),
  price_yearly DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'SAR',
  max_users INTEGER,
  max_branches INTEGER,
  max_warehouses INTEGER,
  max_products INTEGER,
  max_transactions_per_month INTEGER,
  storage_limit_mb INTEGER,
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  badge VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plans_active ON plans(is_active, is_public);

INSERT INTO plans (name, name_ar, price_monthly, max_users, max_branches, is_public) VALUES
('basic', 'أساسي', 0, 2, 1, true),
('professional', 'احترافي', 299, 10, 3, true),
('enterprise', 'مؤسسي', 999, NULL, NULL, true);
```

### plan_features
```sql
CREATE TABLE plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  is_included BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_plan_feature UNIQUE(plan_id, feature_id)
);

CREATE INDEX idx_plan_features_plan ON plan_features(plan_id);
CREATE INDEX idx_plan_features_feature ON plan_features(feature_id);
```

---

## Products & Inventory

### categories
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url VARCHAR(500),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_categories_tenant ON categories(tenant_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_active ON categories(tenant_id, is_active) WHERE deleted_at IS NULL;
```

### brands
```sql
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMP,
  CONSTRAINT unique_brand_name_per_tenant UNIQUE(tenant_id, name)
);

CREATE INDEX idx_brands_tenant ON brands(tenant_id);
CREATE INDEX idx_brands_active ON brands(tenant_id, is_active) WHERE deleted_at IS NULL;
```

### products
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  name VARCHAR(500) NOT NULL,
  sku VARCHAR(100),
  barcode VARCHAR(100),
  description TEXT,
  specifications JSONB DEFAULT '{}'::jsonb,
  cost_price DECIMAL(15, 4) DEFAULT 0,
  selling_price DECIMAL(15, 4) NOT NULL,
  wholesale_price DECIMAL(15, 4),
  distributor_price DECIMAL(15, 4),
  min_price DECIMAL(15, 4),
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  is_tax_inclusive BOOLEAN DEFAULT false,
  track_inventory BOOLEAN DEFAULT true,
  min_stock_level INTEGER DEFAULT 0,
  max_stock_level INTEGER,
  reorder_point INTEGER,
  unit VARCHAR(50) DEFAULT 'piece',
  weight DECIMAL(10, 3),
  weight_unit VARCHAR(20),
  image_url VARCHAR(500),
  images JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  parent_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_attributes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMP,
  CONSTRAINT unique_sku_per_tenant UNIQUE(tenant_id, sku),
  CONSTRAINT unique_barcode_per_tenant UNIQUE(tenant_id, barcode),
  CONSTRAINT positive_prices CHECK (cost_price >= 0 AND selling_price > 0)
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_category ON products(tenant_id, category_id);
CREATE INDEX idx_products_brand ON products(tenant_id, brand_id);
CREATE INDEX idx_products_sku ON products(tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_barcode ON products(tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_active ON products(tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('arabic', name));
CREATE INDEX idx_products_parent ON products(parent_product_id) WHERE parent_product_id IS NOT NULL;
```

### branches
```sql
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_branches_active ON branches(tenant_id, is_active) WHERE deleted_at IS NULL;
```

### warehouses
```sql
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_warehouses_active ON warehouses(tenant_id, is_active) WHERE deleted_at IS NULL;
```

### inventory
```sql
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_inventory_low_stock ON inventory(tenant_id)
  WHERE available_quantity < 10;
```

### inventory_transactions
```sql
CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  created_by UUID,
  CONSTRAINT valid_quantity CHECK (
    (type IN ('sale', 'return_out', 'transfer_out', 'damage') AND quantity < 0) OR
    (type IN ('purchase', 'return_in', 'transfer_in', 'adjustment', 'opening_balance') AND quantity >= 0)
  )
);

CREATE INDEX idx_inventory_txn_tenant ON inventory_transactions(tenant_id);
CREATE INDEX idx_inventory_txn_product ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_txn_warehouse ON inventory_transactions(warehouse_id);
CREATE INDEX idx_inventory_txn_type ON inventory_transactions(tenant_id, type);
CREATE INDEX idx_inventory_txn_date ON inventory_transactions(tenant_id, created_at DESC);
CREATE INDEX idx_inventory_txn_reference ON inventory_transactions(reference_type, reference_id);
```

---

## Customers & Suppliers

### customers
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_customers_email ON customers(tenant_id, email);
CREATE INDEX idx_customers_active ON customers(tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_name_search ON customers USING gin(to_tsvector('arabic', name));
```

### suppliers
```sql
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_suppliers_phone ON suppliers(tenant_id, phone);
CREATE INDEX idx_suppliers_active ON suppliers(tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_suppliers_name_search ON suppliers USING gin(to_tsvector('arabic', name));
```

---

## Sales

### sales
```sql
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_sales_payment_status ON sales(tenant_id, payment_status);
CREATE INDEX idx_sales_number ON sales(tenant_id, sale_number);
CREATE INDEX idx_sales_branch ON sales(branch_id);
CREATE INDEX idx_sales_warehouse ON sales(warehouse_id);
CREATE INDEX idx_sales_created_by ON sales(tenant_id, created_by);
```

### sale_items
```sql
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  CONSTRAINT positive_quantity CHECK (quantity > 0),
  CONSTRAINT positive_price CHECK (unit_price >= 0)
);

CREATE INDEX idx_sale_items_tenant ON sale_items(tenant_id);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
```

### sale_returns
```sql
CREATE TABLE sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_sale_returns_date ON sale_returns(tenant_id, return_date DESC);
```

### sale_return_items
```sql
CREATE TABLE sale_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_sale_return_items_tenant ON sale_return_items(tenant_id);
CREATE INDEX idx_sale_return_items_return ON sale_return_items(return_id);
CREATE INDEX idx_sale_return_items_product ON sale_return_items(product_id);
```

---

## Payments

### payment_methods
```sql
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_payment_methods_active ON payment_methods(tenant_id, is_active);
```

### payments
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(tenant_id, payment_date DESC);
CREATE INDEX idx_payments_method ON payments(payment_method_id);
```

---

## Purchases

### purchases
```sql
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_purchases_date ON purchases(tenant_id, purchase_date DESC);
CREATE INDEX idx_purchases_status ON purchases(tenant_id, status);
CREATE INDEX idx_purchases_warehouse ON purchases(warehouse_id);
```

### purchase_items
```sql
CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_purchase_items_tenant ON purchase_items(tenant_id);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product ON purchase_items(product_id);
```

---

## Cash Register

### cash_registers
```sql
CREATE TABLE cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_cash_registers_branch ON cash_registers(branch_id);
CREATE INDEX idx_cash_registers_open ON cash_registers(tenant_id, is_open);
```

### cash_register_shifts
```sql
CREATE TABLE cash_register_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  cash_difference DECIMAL(15, 4) GENERATED ALWAYS AS (
    actual_cash - (opening_balance + expected_cash_sales - expected_expenses + expected_cash_in - expected_cash_out)
  ) STORED,
  closing_notes TEXT,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_shift_number_per_tenant UNIQUE(tenant_id, shift_number)
);

CREATE INDEX idx_shifts_tenant ON cash_register_shifts(tenant_id);
CREATE INDEX idx_shifts_register ON cash_register_shifts(cash_register_id);
CREATE INDEX idx_shifts_user ON cash_register_shifts(user_id);
CREATE INDEX idx_shifts_date ON cash_register_shifts(tenant_id, opened_at DESC);
CREATE INDEX idx_shifts_status ON cash_register_shifts(tenant_id, status);
```

### cash_transactions
```sql
CREATE TABLE cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_cash_txn_type ON cash_transactions(tenant_id, type);
CREATE INDEX idx_cash_txn_date ON cash_transactions(tenant_id, created_at DESC);
```

---

## Expenses

### expense_categories
```sql
CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_expense_category_per_tenant UNIQUE(tenant_id, name)
);

CREATE INDEX idx_expense_categories_tenant ON expense_categories(tenant_id);
```

### expenses
```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_date ON expenses(tenant_id, expense_date DESC);
CREATE INDEX idx_expenses_branch ON expenses(branch_id);
CREATE INDEX idx_expenses_status ON expenses(tenant_id, status);
```

---

## Audit Logs


```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  user_ip VARCHAR(45),
  user_agent TEXT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  description TEXT,
  severity VARCHAR(20) DEFAULT 'info',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_date ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
```

---

## Views & Functions

### View: Product Stock Summary
```sql
CREATE VIEW product_stock_summary AS
SELECT
  p.id AS product_id,
  p.tenant_id,
  p.name AS product_name,
  p.sku,
  p.barcode,
  p.cost_price,
  p.selling_price,
  COALESCE(SUM(i.quantity), 0) AS total_quantity,
  COALESCE(SUM(i.available_quantity), 0) AS available_quantity,
  COALESCE(SUM(i.reserved_quantity), 0) AS reserved_quantity,
  p.min_stock_level,
  CASE
    WHEN COALESCE(SUM(i.available_quantity), 0) <= p.min_stock_level THEN true
    ELSE false
  END AS is_low_stock
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id
WHERE p.deleted_at IS NULL
  AND p.track_inventory = true
GROUP BY p.id;
```

### View: Sales Summary
```sql
CREATE VIEW daily_sales_summary AS
SELECT
  s.tenant_id,
  s.branch_id,
  DATE(s.sale_date) AS sale_date,
  COUNT(*) AS total_sales,
  SUM(s.total) AS total_revenue,
  SUM(s.cogs) AS total_cogs,
  SUM(s.gross_profit) AS total_profit,
  SUM(s.paid_amount) AS total_paid,
  SUM(s.remaining_amount) AS total_remaining
FROM sales s
WHERE s.status = 'completed'
  AND s.voided_at IS NULL
GROUP BY s.tenant_id, s.branch_id, DATE(s.sale_date);
```

### Function: Update Inventory
```sql
CREATE OR REPLACE FUNCTION update_inventory(
  p_tenant_id UUID,
  p_product_id UUID,
  p_warehouse_id UUID,
  p_quantity DECIMAL,
  p_unit_cost DECIMAL DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_current_qty DECIMAL;
  v_current_cost DECIMAL;
  v_current_version INTEGER;
BEGIN
  SELECT quantity, weighted_avg_cost, version
  INTO v_current_qty, v_current_cost, v_current_version
  FROM inventory
  WHERE tenant_id = p_tenant_id
    AND product_id = p_product_id
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO inventory (tenant_id, product_id, warehouse_id, quantity, weighted_avg_cost, last_cost)
    VALUES (p_tenant_id, p_product_id, p_warehouse_id, p_quantity, COALESCE(p_unit_cost, 0), COALESCE(p_unit_cost, 0));
  ELSE
    IF p_quantity > 0 AND p_unit_cost IS NOT NULL THEN
      v_current_cost := ((v_current_qty * v_current_cost) + (p_quantity * p_unit_cost)) / (v_current_qty + p_quantity);
    END IF;

    UPDATE inventory
    SET
      quantity = v_current_qty + p_quantity,
      weighted_avg_cost = COALESCE(v_current_cost, weighted_avg_cost),
      last_cost = COALESCE(p_unit_cost, last_cost),
      version = v_current_version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = p_tenant_id
      AND product_id = p_product_id
      AND warehouse_id = p_warehouse_id
      AND version = v_current_version;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory updated by another transaction';
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## Row Level Security (RLS) Example

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON products
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Set tenant context in application before each query:
-- SET LOCAL app.current_tenant_id = '{tenant_id}';
```

---

## Database Migrations Strategy

- Use TypeORM migrations
- Version-controlled migration files
- Separate migrations for: schema changes, data migrations, seed data
- Test migrations on staging before production
- Backup before migration
- Rollback plan for each migration

---

## Backup & Recovery

- Daily automated backups
- Point-in-time recovery enabled
- Backup retention: 30 days
- Test restore monthly
- Document recovery procedures

---

## Performance Optimization

### Indexing Strategy
- Tenant ID on all tenant-scoped tables
- Composite indexes for common queries
- Full-text search indexes for Arabic text
- Unique constraints for business keys

### Query Optimization
- Use EXPLAIN ANALYZE for slow queries
- Avoid N+1 queries
- Use pagination for large result sets
- Implement query result caching where appropriate

### Maintenance
- VACUUM ANALYZE regularly
- Monitor table bloat
- Rebuild indexes periodically
- Monitor slow query log
