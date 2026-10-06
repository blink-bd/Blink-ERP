import { DataSource } from 'typeorm';
import { Feature } from '@/modules/features/entities/feature.entity';
import { Plan } from '@/modules/features/entities/plan.entity';

export async function seedFeatures(dataSource: DataSource): Promise<void> {
  const featuresRepository = dataSource.getRepository(Feature);

  const features = [
    // Core (always on)
    {
      code: 'dashboard',
      name: 'Dashboard',
      nameAr: 'لوحة التحكم',
      category: 'core',
      isCore: true,
      isDefault: true,
    },
    {
      code: 'users',
      name: 'User Management',
      nameAr: 'إدارة المستخدمين',
      category: 'core',
      isCore: true,
      isDefault: true,
    },
    {
      code: 'settings',
      name: 'Settings',
      nameAr: 'الإعدادات',
      category: 'core',
      isCore: true,
      isDefault: true,
    },

    // Standard (default on)
    {
      code: 'pos',
      name: 'Point of Sale',
      nameAr: 'نقطة البيع',
      category: 'sales',
      isDefault: true,
    },
    {
      code: 'sales',
      name: 'Sales Management',
      nameAr: 'إدارة المبيعات',
      category: 'sales',
      isDefault: true,
    },
    {
      code: 'products',
      name: 'Product Catalog',
      nameAr: 'كتالوج المنتجات',
      category: 'core',
      isDefault: true,
    },
    {
      code: 'inventory',
      name: 'Inventory Management',
      nameAr: 'إدارة المخزون',
      category: 'inventory',
      isDefault: true,
    },
    {
      code: 'customers',
      name: 'Customer Management',
      nameAr: 'إدارة العملاء',
      category: 'sales',
      isDefault: true,
    },
    {
      code: 'suppliers',
      name: 'Supplier Management',
      nameAr: 'إدارة الموردين',
      category: 'purchases',
      isDefault: true,
    },
    {
      code: 'purchases',
      name: 'Purchase Management',
      nameAr: 'إدارة المشتريات',
      category: 'purchases',
      isDefault: true,
    },
    {
      code: 'returns',
      name: 'Returns Management',
      nameAr: 'إدارة المرتجعات',
      category: 'sales',
      isDefault: true,
    },
    {
      code: 'cash_register',
      name: 'Cash Register',
      nameAr: 'إدارة الخزينة',
      category: 'sales',
      isDefault: true,
    },
    {
      code: 'expenses',
      name: 'Expense Tracking',
      nameAr: 'تتبع المصروفات',
      category: 'accounting',
      isDefault: true,
    },
    {
      code: 'reports',
      name: 'Basic Reports',
      nameAr: 'التقارير الأساسية',
      category: 'reports',
      isDefault: true,
    },

    // Advanced / premium (opt-in)
    {
      code: 'advanced_reports',
      name: 'Advanced Reports',
      nameAr: 'التقارير المتقدمة',
      category: 'reports',
      isDefault: false,
      requiresPlan: true,
    },
    {
      code: 'branches',
      name: 'Multi-Branch',
      nameAr: 'الفروع المتعددة',
      category: 'advanced',
      isDefault: false,
      requiresPlan: true,
    },
    {
      code: 'warehouses',
      name: 'Multi-Warehouse',
      nameAr: 'المخازن المتعددة',
      category: 'advanced',
      isDefault: false,
      requiresPlan: true,
    },
    {
      code: 'barcode_printing',
      name: 'Barcode Printing',
      nameAr: 'طباعة الباركود',
      category: 'tools',
      isDefault: false,
      requiresPlan: true,
    },
    {
      code: 'half_wholesale_pricing',
      name: 'Half-Wholesale Pricing',
      nameAr: 'تسعير نصف الجملة',
      description: 'Adds a third price tier (half-wholesale) to products and POS.',
      descriptionAr: 'إضافة مستوى سعر ثالث (نصف جملة) بجانب القطاعي والجملة في المنتجات ونقطة البيع.',
      category: 'sales',
      isDefault: false,
      requiresPlan: true,
    },
    {
      code: 'import_export',
      name: 'Data Import/Export',
      nameAr: 'استيراد/تصدير البيانات',
      category: 'tools',
      isDefault: false,
    },
    {
      code: 'api_access',
      name: 'API Access',
      nameAr: 'الوصول عبر API',
      category: 'integrations',
      isDefault: false,
      requiresPlan: true,
    },
  ];

  for (const feature of features) {
    const exists = await featuresRepository.findOne({ where: { code: feature.code } });
    if (!exists) {
      await featuresRepository.save(feature);
    }
  }

  console.log('✅ Features seeded successfully');

  // Plans
  const plansRepository = dataSource.getRepository(Plan);
  const plans = [
    {
      name: 'basic',
      nameAr: 'أساسي',
      priceMonthly: 0,
      maxUsers: 2,
      maxBranches: 1,
      isPublic: true,
    },
    {
      name: 'professional',
      nameAr: 'احترافي',
      priceMonthly: 299,
      maxUsers: 10,
      maxBranches: 3,
      isPublic: true,
      badge: 'popular',
    },
    {
      name: 'enterprise',
      nameAr: 'مؤسسي',
      priceMonthly: 999,
      isPublic: true,
      badge: 'recommended',
    },
  ];

  for (const plan of plans) {
    const exists = await plansRepository.findOne({ where: { name: plan.name } });
    if (!exists) {
      await plansRepository.save(plan);
    }
  }

  console.log('✅ Plans seeded successfully');
}
