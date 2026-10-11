/**
 * الصلاحيات المسموح منحها لمفاتيح الـ API (للتكامل مع متجر إلكتروني أو نظام خارجي).
 * أي صلاحية إدارية (مستخدمين، أدوار، نسخ احتياطي، حذف، إلغاء فواتير...) ممنوعة نهائياً
 * على المفاتيح حتى لو صاحب المفتاح نفسه عنده الصلاحية.
 */
export const API_KEY_GRANTABLE_PERMISSIONS = [
  'products.view',
  'products.create',
  'products.update',
  'categories.view',
  'brands.view',
  'inventory.view',
  'customers.view',
  'customers.create',
  'customers.update',
  'suppliers.view',
  'sales.view',
  'sales.create',
  'purchases.view',
  'reports.view',
] as const;

export const API_KEY_PREFIX = 'blk_live_';
export const MAX_API_KEYS_PER_TENANT = 20;
