import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenant_branding')
export class TenantBranding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId: string;

  @Column({ name: 'app_name', length: 255, default: 'نظام نقاط البيع' })
  appName: string;

  @Column({ name: 'app_name_en', length: 255, nullable: true })
  appNameEn?: string;

  @Column({ name: 'logo_url', length: 500, nullable: true })
  logoUrl?: string;

  @Column({ name: 'logo_light_url', length: 500, nullable: true })
  logoLightUrl?: string;

  @Column({ name: 'logo_dark_url', length: 500, nullable: true })
  logoDarkUrl?: string;

  @Column({ name: 'favicon_url', length: 500, nullable: true })
  faviconUrl?: string;

  @Column({ name: 'login_background_url', length: 500, nullable: true })
  loginBackgroundUrl?: string;

  @Column({ name: 'primary_color', length: 7, default: '#0858A2' })
  primaryColor: string;

  @Column({ name: 'secondary_color', length: 7, default: '#64748B' })
  secondaryColor: string;

  @Column({ name: 'accent_color', length: 7, default: '#10B981' })
  accentColor: string;

  @Column({ name: 'sidebar_color', length: 7, default: '#1E293B' })
  sidebarColor: string;

  @Column({ name: 'header_color', length: 7, default: '#FFFFFF' })
  headerColor: string;

  @Column({ name: 'font_family', length: 255, default: 'Cairo, sans-serif' })
  fontFamily: string;

  @Column({ name: 'border_radius', length: 10, default: '0.5rem' })
  borderRadius: string;

  @Column({ name: 'invoice_template', length: 50, default: 'modern' })
  invoiceTemplate: 'modern' | 'classic' | 'minimal';

  @Column({ name: 'invoice_show_logo', default: true })
  invoiceShowLogo: boolean;

  @Column({ name: 'invoice_footer_text', type: 'text', nullable: true })
  invoiceFooterText?: string;

  @Column({ name: 'custom_css', type: 'text', nullable: true })
  customCss?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string;
}
