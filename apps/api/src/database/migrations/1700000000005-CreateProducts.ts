import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProducts1700000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE categories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

      CREATE TABLE brands (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

      CREATE TABLE products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS brands;
      DROP TABLE IF EXISTS categories;
    `);
  }
}
