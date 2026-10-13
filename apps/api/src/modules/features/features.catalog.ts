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
  /**
   * زرار/إجراء جوه صفحة (مش صفحة كاملة): كود الصفحة/الميزة الأم. الإجراءات مفعّلة
   * افتراضياً لكل التجار لحد ما المدير العام يقفلها، ولما الصفحة الأم تتقفل بتتقفل معاها
   * من غير ما تفقد حالتها (لما الصفحة ترجع، الإجراء يرجع زي ما كان).
   */
  parent?: string;
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
  {
    code: 'branch_analytics',
    name: 'Branch Analytics',
    nameAr: 'تقارير الفروع وحساباتها',
    descriptionAr: 'تقارير منفصلة لفرع واحد أو لمجموعة فروع مختارة.',
    category: 'advanced',
    requiresPlan: true,
    dependsOn: ['branches'],
    sortOrder: 36,
  },
  {
    code: 'return_disposition',
    name: 'Return Inspection and Disposition',
    nameAr: 'فحص ومعالجة المرتجعات',
    descriptionAr: 'حجز المرتجع حتى فحصه ثم إعادته للمخزون أو إرساله للمورد أو تسجيل صيانته.',
    category: 'sales',
    dependsOn: ['returns', 'inventory'],
    sortOrder: 37,
  },
  {
    code: 'balance_reminders',
    name: 'Customer and Supplier Balance Reminders',
    nameAr: 'تنبيهات أرصدة العملاء والموردين',
    descriptionAr: 'جدولة تنبيهات البريد وWhatsApp للأرصدة المستحقة.',
    category: 'accounting',
    sortOrder: 38,
  },
  {
    code: 'invoice_attachments',
    name: 'Invoice Evidence Attachments',
    nameAr: 'مرفقات إثبات الفواتير',
    descriptionAr: 'رفع وإدارة مستندات وصور إثبات فواتير المبيعات والمشتريات.',
    category: 'accounting',
    sortOrder: 39,
  },
  {
    code: 'supplier_balance_limit',
    name: 'Supplier Payables Limit Alert',
    nameAr: 'تنبيه حد أرصدة الموردين',
    descriptionAr: 'تنبيه عند وصول إجمالي المستحقات للموردين إلى الحد المحدد.',
    category: 'accounting',
    sortOrder: 40,
  },
  {
    code: 'maintenance_management',
    name: 'Maintenance Management',
    nameAr: 'إدارة الصيانة وفواتيرها',
    descriptionAr: 'تسجيل عمليات صيانة الأجهزة وفواتيرها وإيراداتها ومصروفاتها.',
    category: 'sales',
    sortOrder: 41,
  },
];

/** زراير وإجراءات جوه الصفحات — كل واحد يتقفل/يتفتح لكل تاجر من لوحة المدير العام. */
const ACTIONS: Array<Omit<FeatureDefinition, 'category' | 'sortOrder' | 'name'> & { name?: string }> = [
  // لوحة التحكم
  {
    code: 'dashboard.balances',
    parent: 'dashboard',
    nameAr: 'مديونيات العملاء والموردين في لوحة التحكم',
    descriptionAr: 'كروت إجمالي المستحق على العملاء وللموردين في الصفحة الرئيسية.',
  },
  // نقطة البيع
  {
    code: 'pos.discount',
    parent: 'pos',
    nameAr: 'خصم على الفاتورة',
    descriptionAr: 'خانة الخصم في نقطة البيع (والخصم على الأصناف).',
  },
  {
    code: 'pos.credit_sale',
    parent: 'pos',
    nameAr: 'البيع الآجل والدفع الجزئي',
    descriptionAr: 'تسجيل فاتورة على حساب العميل من غير دفع كامل.',
  },
  {
    code: 'pos.wholesale_price',
    parent: 'pos',
    nameAr: 'البيع بسعر الجملة',
    descriptionAr: 'اختيار سعر الجملة بدل القطاعي في نقطة البيع.',
  },
  {
    code: 'pos.multi_invoices',
    parent: 'pos',
    nameAr: 'فتح أكثر من فاتورة في نفس الوقت',
    descriptionAr: 'أزرار فاتورة جديدة/الفواتير المفتوحة في نقطة البيع.',
  },
  {
    code: 'pos.print_receipt',
    parent: 'pos',
    nameAr: 'طباعة الإيصال',
    descriptionAr: 'طباعة إيصال البيع تلقائياً بعد كل فاتورة.',
  },
  {
    code: 'pos.share_after_sale',
    parent: 'pos',
    nameAr: 'إرسال الفاتورة بعد البيع',
    descriptionAr: 'شريط «إرسال للعميل واتساب» بعد كل فاتورة في نقطة البيع.',
    dependsOn: ['sales.share'],
  },
  // المبيعات
  {
    code: 'sales.share',
    parent: 'sales',
    nameAr: 'إرسال فواتير البيع واتساب',
    descriptionAr: 'زرار إرسال الفاتورة للعميل كلينك على الواتساب.',
  },
  {
    code: 'sales.collect_payment',
    parent: 'sales',
    nameAr: 'تحصيل دفعات على الفواتير',
    descriptionAr: 'تسجيل دفعة على فاتورة آجلة.',
  },
  {
    code: 'sales.void',
    parent: 'sales',
    nameAr: 'إلغاء فواتير البيع',
    descriptionAr: 'إلغاء فاتورة بيع بالكامل.',
  },
  // المنتجات
  {
    code: 'products.delete',
    parent: 'products',
    nameAr: 'حذف المنتجات',
    descriptionAr: 'زرار حذف المنتج.',
  },
  {
    code: 'products.cost_price',
    parent: 'products',
    nameAr: 'عرض سعر التكلفة',
    descriptionAr: 'عمود وخانة سعر التكلفة في صفحة المنتجات.',
  },
  // المخزون
  {
    code: 'inventory.adjust',
    parent: 'inventory',
    nameAr: 'تعديل الكميات (جرد)',
    descriptionAr: 'تعديل كمية صنف يدوياً بالزيادة أو النقص.',
  },
  {
    code: 'inventory.transfers',
    parent: 'inventory',
    nameAr: 'تحويلات المخزون بين الفروع',
    descriptionAr: 'صفحة تحويلات الفروع وطلبات التحويل واعتمادها.',
  },
  // العملاء
  {
    code: 'customers.payments',
    parent: 'customers',
    nameAr: 'تحصيل من العملاء',
    descriptionAr: 'تسجيل مبلغ محصّل من العميل على حسابه.',
  },
  {
    code: 'customers.statement',
    parent: 'customers',
    nameAr: 'كشف حساب العميل',
    descriptionAr: 'عرض وطباعة كشف حساب العميل.',
  },
  {
    code: 'customers.delete',
    parent: 'customers',
    nameAr: 'حذف العملاء',
    descriptionAr: 'زرار حذف العميل.',
  },
  // الموردين
  {
    code: 'suppliers.settle',
    parent: 'suppliers',
    nameAr: 'سداد للموردين',
    descriptionAr: 'تسجيل مبلغ مدفوع للمورد.',
  },
  {
    code: 'suppliers.statement',
    parent: 'suppliers',
    nameAr: 'كشف حساب المورد',
    descriptionAr: 'عرض وطباعة كشف حساب المورد.',
  },
  {
    code: 'suppliers.delete',
    parent: 'suppliers',
    nameAr: 'حذف الموردين',
    descriptionAr: 'زرار حذف المورد.',
  },
  // المشتريات
  {
    code: 'purchases.share',
    parent: 'purchases',
    nameAr: 'إرسال فواتير الشراء واتساب',
    descriptionAr: 'زرار إرسال فاتورة الشراء للمورد كلينك على الواتساب.',
  },
  {
    code: 'purchases.print',
    parent: 'purchases',
    nameAr: 'طباعة فواتير الشراء',
    descriptionAr: 'زرار طباعة فاتورة الشراء.',
  },
  // المصروفات
  {
    code: 'expenses.categories',
    parent: 'expenses',
    nameAr: 'إضافة تصنيفات مصروفات',
    descriptionAr: 'إنشاء تصنيفات جديدة للمصروفات.',
  },
  // الخزينة
  {
    code: 'cash_register.transactions',
    parent: 'cash_register',
    nameAr: 'إيداع وسحب يدوي من الخزينة',
    descriptionAr: 'تسجيل حركات نقدية يدوية في الوردية.',
  },
  {
    code: 'cash_register.registers',
    parent: 'cash_register',
    nameAr: 'إضافة خزن جديدة',
    descriptionAr: 'إنشاء خزينة إضافية.',
  },
  // المستخدمين
  {
    code: 'users.manage',
    parent: 'users',
    nameAr: 'إضافة وتعديل المستخدمين',
    descriptionAr: 'إضافة موظفين وتعديل بياناتهم وإيقافهم وحذفهم.',
  },
  {
    code: 'users.roles',
    parent: 'users',
    nameAr: 'إدارة الأدوار والصلاحيات',
    descriptionAr: 'إنشاء وتعديل أدوار الموظفين وصلاحياتها.',
  },
  {
    code: 'users.reset_password',
    parent: 'users',
    nameAr: 'تغيير كلمات مرور الموظفين',
    descriptionAr:
      'صاحب الحساب يغيّر كلمة مرور موظفيه. كلمة مرور صاحب الحساب نفسه بتتغير من الإدارة بس.',
  },
  // الإعدادات
  {
    code: 'settings.alerts',
    parent: 'settings',
    nameAr: 'تنبيهات الحساب',
    descriptionAr: 'واتساب وإيميل التاجر وأنواع التنبيهات اللي توصله.',
  },
  {
    code: 'settings.backup',
    parent: 'settings',
    nameAr: 'تنزيل نسخة احتياطية',
    descriptionAr: 'تنزيل نسخة JSON من بيانات المتجر.',
  },
  {
    code: 'settings.webhooks',
    parent: 'settings',
    nameAr: 'Webhooks',
    descriptionAr: 'إرسال الأحداث لأنظمة خارجية.',
  },
];

const parentSortOrder = (code: string) =>
  FEATURE_CATALOG.find((feature) => feature.code === code)?.sortOrder ?? 0;

for (const [index, action] of ACTIONS.entries()) {
  const parent = FEATURE_CATALOG.find((feature) => feature.code === action.parent);
  FEATURE_CATALOG.push({
    ...action,
    name: action.name || action.code,
    category: parent?.category || 'core',
    isDefault: true,
    dependsOn: [action.parent as string, ...(action.dependsOn || [])],
    sortOrder: parentSortOrder(action.parent as string) * 100 + index + 1,
  });
}

export const isActionFeature = (code: string): boolean =>
  Boolean(FEATURE_CATALOG.find((feature) => feature.code === code)?.parent);

export const FEATURE_CODES = new Set(FEATURE_CATALOG.map((f) => f.code));

export function getFeatureDefinition(code: string): FeatureDefinition | undefined {
  return FEATURE_CATALOG.find((f) => f.code === code);
}
