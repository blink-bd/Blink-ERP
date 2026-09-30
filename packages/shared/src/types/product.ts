import { TenantBaseEntity } from './common';

export interface Product extends TenantBaseEntity {
  categoryId?: string;
  brandId?: string;
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  specifications?: Record<string, any>;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  distributorPrice?: number;
  minPrice?: number;
  taxRate: number;
  isTaxInclusive: boolean;
  trackInventory: boolean;
  minStockLevel: number;
  maxStockLevel?: number;
  reorderPoint?: number;
  unit: string;
  weight?: number;
  weightUnit?: string;
  imageUrl?: string;
  images?: string[];
  isActive: boolean;
  isFeatured: boolean;
  parentProductId?: string;
  variantAttributes?: Record<string, any>;
  category?: Category;
  brand?: Brand;
}

export interface Category extends TenantBaseEntity {
  parentId?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Brand extends TenantBaseEntity {
  name: string;
  description?: string;
  logoUrl?: string;
  isActive: boolean;
}
