import { BaseEntity } from './common';
import { TenantBranding } from './tenant';

export interface User extends BaseEntity {
  tenantId: string;
  email: string;
  fullName: string;
  phone?: string;
  branchId?: string;
  warehouseId?: string;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt?: Date;
  roles: Role[];
}

export interface Role {
  id: string;
  name: string;
  nameAr: string;
  description?: string;
  isSystem: boolean;
  permissions: Permission[];
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  scope: 'own' | 'branch' | 'all';
  name: string;
  description?: string;
  category?: string;
}

export interface AuthResponse {
  user: User;
  tenant: {
    id: string;
    businessName: string;
    currency: string;
    timezone: string;
    defaultLanguage: string;
  };
  features: string[];
  branding: TenantBranding;
  accessToken: string;
  refreshToken: string;
}
