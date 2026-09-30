import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeaturesAndPlans1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE features (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        description TEXT,
        description_ar TEXT,
        category VARCHAR(50),
        module VARCHAR(50),
        depends_on UUID[] DEFAULT ARRAY[]::UUID[],
        is_default BOOLEAN DEFAULT false,
        is_core BOOLEAN DEFAULT false,
        requires_plan BOOLEAN DEFAULT false,
        icon VARCHAR(50),
        color VARCHAR(7),
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        is_beta BOOLEAN DEFAULT false,
        config_schema JSONB,
        limits_schema JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_features_code ON features(code);
      CREATE INDEX idx_features_category ON features(category);

      CREATE TABLE tenant_features (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
        is_enabled BOOLEAN DEFAULT true,
        config JSONB DEFAULT '{}'::jsonb,
        limits JSONB DEFAULT '{}'::jsonb,
        trial_ends_at TIMESTAMP,
        expires_at TIMESTAMP,
        enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        enabled_by UUID,
        disabled_at TIMESTAMP,
        disabled_by UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_tenant_feature UNIQUE(tenant_id, feature_id)
      );
      CREATE INDEX idx_tenant_features_tenant ON tenant_features(tenant_id);
      CREATE INDEX idx_tenant_features_enabled ON tenant_features(tenant_id, is_enabled);

      CREATE TABLE plans (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

      CREATE TABLE plan_features (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
        is_included BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_plan_feature UNIQUE(plan_id, feature_id)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS plan_features;
      DROP TABLE IF EXISTS plans;
      DROP TABLE IF EXISTS tenant_features;
      DROP TABLE IF EXISTS features;
    `);
  }
}
