import { MigrationInterface, QueryRunner } from 'typeorm';

/** Reset every tenant to the product's canonical visual identity. */
export class ResetTenantBrandingDefaults1700000000018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE tenant_branding
      SET app_name = 'نظام نقاط البيع',
          app_name_en = 'Point of Sale System',
          logo_url = NULL,
          logo_light_url = NULL,
          logo_dark_url = NULL,
          favicon_url = NULL,
          login_background_url = NULL,
          primary_color = '#0858A2',
          primary_dark = NULL,
          primary_light = NULL,
          secondary_color = '#64748B',
          accent_color = '#10B981',
          background_color = '#FFFFFF',
          surface_color = '#F8FAFC',
          sidebar_color = '#1E293B',
          header_color = '#FFFFFF',
          text_primary = '#1F2937',
          text_secondary = '#6B7280',
          text_on_primary = '#FFFFFF',
          border_color = '#E5E7EB',
          divider_color = '#E5E7EB',
          success_color = '#10B981',
          warning_color = '#F59E0B',
          error_color = '#EF4444',
          info_color = '#3B82F6',
          font_family = 'Cairo, sans-serif',
          font_size_base = '16px',
          border_radius = '0.5rem',
          spacing_unit = '0.25rem',
          login_background_color = NULL,
          login_position = 'center',
          login_card_background = NULL,
          login_show_logo = TRUE,
          invoice_template = 'modern',
          invoice_header_color = NULL,
          invoice_show_logo = TRUE,
          invoice_show_tax_info = TRUE,
          invoice_footer_text = NULL,
          receipt_template = 'thermal',
          receipt_width = 80,
          receipt_show_logo = TRUE,
          receipt_header_text = NULL,
          receipt_footer_text = NULL,
          custom_css = NULL,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A destructive global reset cannot reconstruct each tenant's former branding.
    void queryRunner;
  }
}
