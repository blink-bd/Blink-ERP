import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantBranding1700000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenant_branding (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
        app_name VARCHAR(255) DEFAULT 'نظام نقاط البيع',
        app_name_en VARCHAR(255) DEFAULT 'Point of Sale System',
        logo_url VARCHAR(500),
        logo_light_url VARCHAR(500),
        logo_dark_url VARCHAR(500),
        favicon_url VARCHAR(500),
        login_background_url VARCHAR(500),
        primary_color VARCHAR(7) DEFAULT '#0858A2',
        primary_dark VARCHAR(7),
        primary_light VARCHAR(7),
        secondary_color VARCHAR(7) DEFAULT '#64748B',
        accent_color VARCHAR(7) DEFAULT '#10B981',
        background_color VARCHAR(7) DEFAULT '#FFFFFF',
        surface_color VARCHAR(7) DEFAULT '#F8FAFC',
        sidebar_color VARCHAR(7) DEFAULT '#1E293B',
        header_color VARCHAR(7) DEFAULT '#FFFFFF',
        text_primary VARCHAR(7) DEFAULT '#1F2937',
        text_secondary VARCHAR(7) DEFAULT '#6B7280',
        text_on_primary VARCHAR(7) DEFAULT '#FFFFFF',
        border_color VARCHAR(7) DEFAULT '#E5E7EB',
        divider_color VARCHAR(7) DEFAULT '#E5E7EB',
        success_color VARCHAR(7) DEFAULT '#10B981',
        warning_color VARCHAR(7) DEFAULT '#F59E0B',
        error_color VARCHAR(7) DEFAULT '#EF4444',
        info_color VARCHAR(7) DEFAULT '#3B82F6',
        font_family VARCHAR(255) DEFAULT 'Cairo, sans-serif',
        font_size_base VARCHAR(10) DEFAULT '16px',
        border_radius VARCHAR(10) DEFAULT '0.5rem',
        spacing_unit VARCHAR(10) DEFAULT '0.25rem',
        login_background_color VARCHAR(7),
        login_position VARCHAR(20) DEFAULT 'center',
        login_card_background VARCHAR(7),
        login_show_logo BOOLEAN DEFAULT true,
        invoice_template VARCHAR(50) DEFAULT 'modern',
        invoice_header_color VARCHAR(7),
        invoice_show_logo BOOLEAN DEFAULT true,
        invoice_show_tax_info BOOLEAN DEFAULT true,
        invoice_footer_text TEXT,
        receipt_template VARCHAR(50) DEFAULT 'thermal',
        receipt_width INTEGER DEFAULT 80,
        receipt_show_logo BOOLEAN DEFAULT true,
        receipt_header_text TEXT,
        receipt_footer_text TEXT,
        custom_css TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by UUID
      );
      CREATE INDEX idx_tenant_branding_tenant ON tenant_branding(tenant_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_branding;`);
  }
}
