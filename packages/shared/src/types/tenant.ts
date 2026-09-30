import { BaseEntity } from './common';

export interface Tenant extends BaseEntity {
  businessName: string;
  businessNameAr: string;
  businessNameEn?: string;
  tradeName?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country: string;
  currency: string;
  timezone: string;
  defaultLanguage: string;
  planId?: string;
  subscriptionStartDate?: Date;
  subscriptionEndDate?: Date;
  subscriptionStatus: 'active' | 'expired' | 'suspended' | 'cancelled';
  trialEndsAt?: Date;
  isActive: boolean;
}

export interface TenantBranding {
  id: string;
  tenantId: string;
  appName: string;
  appNameEn?: string;
  logoUrl?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  loginBackgroundUrl?: string;
  colors: {
    primary: string;
    primaryDark?: string;
    primaryLight?: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    sidebar: string;
    header: string;
    textPrimary: string;
    textSecondary: string;
    textOnPrimary: string;
    border: string;
    divider: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  typography: { fontFamily: string; fontSizeBase: string };
  layout: { borderRadius: string; spacingUnit: string };
  createdAt: Date;
  updatedAt: Date;
}
