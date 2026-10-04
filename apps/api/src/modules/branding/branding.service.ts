import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantBranding } from './entities/tenant-branding.entity';

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const DANGEROUS_CSS_PATTERNS = [
  /javascript:/gi,
  /expression\s*\(/gi,
  /@import/gi,
  /behavior:/gi,
  /-moz-binding:/gi,
];
const MAX_CSS_LENGTH = 10000;
const ALLOWED_FIELDS = [
  'appName',
  'appNameEn',
  'logoUrl',
  'logoLightUrl',
  'logoDarkUrl',
  'faviconUrl',
  'loginBackgroundUrl',
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'sidebarColor',
  'headerColor',
  'fontFamily',
  'borderRadius',
  'invoiceTemplate',
  'invoiceShowLogo',
  'invoiceFooterText',
  'customCss',
];

@Injectable()
export class BrandingService {
  constructor(
    @InjectRepository(TenantBranding)
    private readonly brandingRepository: Repository<TenantBranding>
  ) {}

  async getTenantBranding(tenantId: string): Promise<TenantBranding> {
    let branding = await this.brandingRepository.findOne({ where: { tenantId } });
    if (!branding) {
      branding = this.brandingRepository.create({ tenantId });
      branding = await this.brandingRepository.save(branding);
    }
    return branding;
  }

  async updateBranding(
    tenantId: string,
    rawUpdates: Partial<TenantBranding>
  ): Promise<TenantBranding> {
    const branding = await this.getTenantBranding(tenantId);
    // السماح بحقول الهوية فقط (منع تغيير tenantId/id)
    const updates: Partial<TenantBranding> = {};
    for (const key of ALLOWED_FIELDS) {
      if ((rawUpdates as any)?.[key] !== undefined)
        (updates as any)[key] = (rawUpdates as any)[key];
    }

    const colorFields: (keyof TenantBranding)[] = [
      'primaryColor',
      'secondaryColor',
      'accentColor',
      'sidebarColor',
      'headerColor',
    ];
    for (const field of colorFields) {
      const value = (updates as any)[field];
      if (value && !HEX_COLOR_REGEX.test(value)) {
        throw new BadRequestException(`Invalid color format for ${field}: ${value}`);
      }
    }

    if (updates.customCss) {
      let sanitized = updates.customCss;
      for (const pattern of DANGEROUS_CSS_PATTERNS) {
        sanitized = sanitized.replace(pattern, '');
      }
      if (sanitized.length > MAX_CSS_LENGTH) {
        throw new BadRequestException(
          `Custom CSS exceeds maximum length of ${MAX_CSS_LENGTH} characters`
        );
      }
      updates.customCss = sanitized;
    }

    Object.assign(branding, updates);
    return this.brandingRepository.save(branding);
  }

  async resetToDefaults(tenantId: string): Promise<TenantBranding> {
    await this.brandingRepository.delete({ tenantId });
    return this.getTenantBranding(tenantId);
  }
}
