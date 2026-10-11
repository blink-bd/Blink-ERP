/**
 * كتالوج الميزات — المصدر الوحيد للحقيقة لتعريف كل ميزة في النظام.
 *
 * - isCore: ميزة أساسية مفعّلة دائماً ولا يمكن إيقافها (النظام لا يعمل بدونها).
 * - isDefault: تُفعَّل تلقائياً عند إنشاء تاجر جديد (ويمكن للمدير العام إيقافها).
 * - requiresPlan: ميزة "مدفوعة" — تنبيه للمدير العام بأنها تُباع كإضافة على الاشتراك.
 * - dependsOn: ميزات لازم تكون مفعّلة لكي تعمل هذه الميزة. عند تفعيل ميزة تُفعَّل
 *   اعتمادياتها تلقائياً، وعند إيقاف ميزة تُوقَف الميزات المعتمدة عليها تلقائياً.
 *
 * يتم مزامنة هذا الكتالوج مع جدول features في كل تشغيل للـ seed (عند كل نشر).
 * لإضافة ميزة جديدة: أضفها هنا ثم استخدم @RequireFeature('code') على الـ endpoints.
 */
export interface FeatureDefinition {
  code: string;
  name: string;
  nameAr: string;
  descriptionAr: string;
  category: string;
  isCore?: boolean;
  isDefault?: boolean;
  requiresPlan?: boolean;
  dependsOn?: string[];
  sortOrder: number;
}

export const FEATURE_CATALOG: FeatureDefinition[] = [
  // ---------- أساسية (إجبارية) ----------
  {
    code: 'dashboard',
    name: 'Dashboard',
    nameAr: 'لوحة التحكم',
    descriptionAr: 'الصفحة الرئيسية للتاجر: ملخص المبيعات والأرباح والتنبيهات المهمة.',
    category: 'core',
    isCore: true,
    isDefault: true,
    sortOrder: 1,
  },
  {
    code: 'users',
    name: 'User Management',
    nameAr: 'إدارة المستخدمين',
    descriptionAr: 'إضافة الموظفين وتحديد أدوارهم وصلاحياتهم وإيقافهم وتغيير كلمات مرورهم.',
    category: 'core',
    isCore: true,
    isDefault: true,
    sortOrder: 2,
  },
  {
    code: 'settings',
    name: 'Settings',
    nameAr: 'الإعدادات',
    descriptionAr: 'إعدادات الحساب والأمان والنسخ الاحتياطي.',
    category: 'core',
    isCore: true,
    isDefault: true,
    sortOrder: 3,
  },

  // ---------- قياسية (تُفعَّل تلقائياً) ----------
  {
    code: 'products',
    name: 'Product Catalog',
    nameAr: 'كتالوج المنتجات',
    descriptionAr: 'إضافة المنتجات بأسعار القطاعي والجملة والباركود والتصنيفات والماركات.',
    category: 'core',
    isDefault: true,
    sortOrder: 10,
  },
  {
    code: 'sales',
    name: 'Sales Management',
    nameAr: 'إدارة المبيعات',
    descriptionAr: 'سجل الفواتير وتحصيل الدفعات المتأخرة وإلغاء الفواتير.',
    category: 'sales',
    isDefault: true,
    dependsOn: ['products'],
    sortOrder: 11,
  },
  {
    code: 'pos',
    name: 'Point of Sale',
    nameAr: 'نقطة البيع',
    descriptionAr: 'شاشة الكاشير لإنشاء فواتير البيع بسرعة بالباركود وطباعة الإيصال.',
    category: 'sales',
    isDefault: true,
    dependsOn: ['sales'],
    sortOrder: 12,
  },
  {
    code: 'returns',
    name: 'Returns Management',
    nameAr: 'إدارة المرتجعات',
    descriptionAr: 'استرجاع أصناف من فواتير البيع وإعادتها للمخزون وتسوية حساب العميل.',
    category: 'sales',
    isDefault: true,
    dependsOn: ['sales'],
    sortOrder: 13,
  },
  {
    code: 'inventory',
    name: 'Inventory Management',
    nameAr: 'إدارة المخزون',
    descriptionAr: 'متابعة الكميات وحركات المخزون والتعديلات والتنبيه عند الوصول للحد الأدنى.',
    category: 'inventory',
    isDefault: true,
    dependsOn: ['products'],
    sortOrder: 14,
  },
  {
    code: 'customers',
    name: 'Customer Management',
    nameAr: 'إدارة العملاء',
    descriptionAr: 'بيانات العملاء وكشوف الحساب والمديونيات والتحصيل.',
    category: 'sales',
    isDefault: true,
    sortOrder: 15,
  },
  {
    code: 'suppliers',
    name: 'Supplier Management',
    nameAr: 'إدارة الموردين',
    descriptionAr: 'بيانات الموردين والمستحقات والتسويات.',
    category: 'purchases',
    isDefault: true,
    sortOrder: 16,
  },
  {
    code: 'purchases',
    name: 'Purchase Management',
    nameAr: 'إدارة المشتريات',
    descriptionAr: 'فواتير الشراء من الموردين وإدخال البضاعة للمخزون بتكلفتها.',
    category: 'purchases',
    isDefault: true,
    dependsOn: ['suppliers', 'inventory'],
    sortOrder: 17,
  },
  {
    code: 'cash_register',
    name: 'Cash Register',
    nameAr: 'إدارة الخزينة',
    descriptionAr: 'فتح وإغلاق الورديات ومتابعة حركة النقدية وكشف العجز والزيادة.',
    category: 'sales',
    isDefault: true,
    sortOrder: 18,
  },
  {
    code: 'expenses',
    name: 'Expense Tracking',
    nameAr: 'تتبع المصروفات',
    descriptionAr: 'تسجيل المصروفات (إيجار، كهرباء، رواتب...) لحساب صافي الربح الحقيقي.',
    category: 'accounting',
    isDefault: true,
    sortOrder: 19,
  },
  {
    code: 'reports',
    name: 'Basic Reports',
    nameAr: 'التقارير الأساسية',
    descriptionAr: 'تقارير المبيعات والمشتريات والمصروفات والمخزون.',
    category: 'reports',
    isDefault: true,
    sortOrder: 20,
  },
  {
    code: 'import_export',
    name: 'Data Import/Export',
    nameAr: 'استيراد/تصدير البيانات',
    descriptionAr: 'استيراد وتصدير المنتجات والعملاء والموردين بملفات CSV تفتح على Excel.',
    category: 'tools',
    isDefault: false,
    sortOrder: 21,
  },

  // ---------- متقدمة (مدفوعة) ----------
  {
    code: 'advanced_reports',
    name: 'Advanced Reports',
    nameAr: 'التقارير المتقدمة',
    descriptionAr:
      'الأرباح والخسائر، ربحية كل منتج، أداء الكاشير، طرق الدفع، وتقييم المخزون لكل مخزن.',
    category: 'reports',
    requiresPlan: true,
    dependsOn: ['reports'],
    sortOrder: 30,
  },
  {
    code: 'half_wholesale_pricing',
    name: 'Half Wholesale Pricing',
    nameAr: 'تسعير نصف الجملة',
    descriptionAr: 'سعر ثالث للمنتج بين القطاعي والجملة يظهر في المنتجات ونقطة البيع.',
    category: 'sales',
    requiresPlan: true,
    dependsOn: ['products'],
    sortOrder: 31,
  },
  {
    code: 'branches',
    name: 'Multi-Branch',
    nameAr: 'الفروع المتعددة',
    descriptionAr: 'إدارة أكثر من فرع من نفس الحساب (بدونها يُسمح بفرع واحد فقط).',
    category: 'advanced',
    requiresPlan: true,
    sortOrder: 32,
  },
  {
    code: 'warehouses',
    name: 'Multi-Warehouse',
    nameAr: 'المخازن المتعددة',
    descriptionAr:
      'أكثر من مخزن ونقل البضاعة بينها واختيار المخزن في البيع والشراء (بدونها مخزن واحد).',
    category: 'advanced',
    requiresPlan: true,
    dependsOn: ['inventory'],
    sortOrder: 33,
  },
  {
    code: 'barcode_printing',
    name: 'Barcode Printing',
    nameAr: 'طباعة الباركود',
    descriptionAr: 'طباعة ملصقات باركود للمنتجات (فردي أو بالجملة بعدد النسخ المطلوب).',
    category: 'tools',
    requiresPlan: true,
    dependsOn: ['products'],
    sortOrder: 34,
  },
  {
    code: 'api_access',
    name: 'API Access',
    nameAr: 'الوصول عبر API',
    descriptionAr: 'مفاتيح API بصلاحيات محددة لربط النظام بمتجر إلكتروني أو أي نظام خارجي.',
    category: 'integrations',
    requiresPlan: true,
    sortOrder: 35,
  },
];

export const FEATURE_CODES = new Set(FEATURE_CATALOG.map((f) => f.code));

export function getFeatureDefinition(code: string): FeatureDefinition | undefined {
  return FEATURE_CATALOG.find((f) => f.code === code);
}
