/**
 * تعريف أعمدة الاستيراد/التصدير لكل كيان. عشان تضيف كيان جديد مستقبلاً:
 * 1) أضف تعريفه هنا  2) أضف منطق الحفظ في DataTransferService.writeRow
 */
export type ColumnType = 'string' | 'number' | 'boolean';

export interface ColumnDef {
  key: string;
  label: string; // عنوان العمود بالعربي (اللي بيظهر في الملف)
  type: ColumnType;
  required?: boolean;
  example?: string;
  /** عمود للتصدير فقط (زي الرصيد الحالي والمخزون) — بيتجاهل في الاستيراد */
  exportOnly?: boolean;
  /** بيتطبق عند الإنشاء فقط (زي الرصيد الافتتاحي والكمية الافتتاحية) */
  createOnly?: boolean;
}

export interface EntityDef {
  entity: DataEntity;
  labelAr: string;
  feature: string; // ميزة الكيان نفسه (products/customers/suppliers)
  viewPermission: string;
  createPermission: string;
  updatePermission: string;
  /** الأعمدة اللي بيتم المطابقة بيها لتحديث سجل موجود بدل إنشاء جديد (بالترتيب) */
  matchBy: string[];
  columns: ColumnDef[];
}

export type DataEntity = 'products' | 'customers' | 'suppliers';

export const DATA_ENTITIES: Record<DataEntity, EntityDef> = {
  products: {
    entity: 'products',
    labelAr: 'المنتجات',
    feature: 'products',
    viewPermission: 'products.view',
    createPermission: 'products.create',
    updatePermission: 'products.update',
    matchBy: ['sku', 'barcode'],
    columns: [
      {
        key: 'name',
        label: 'اسم المنتج',
        type: 'string',
        required: true,
        example: 'جراب ايفون 15',
      },
      { key: 'sku', label: 'كود المنتج', type: 'string', example: 'CASE-IP15' },
      { key: 'barcode', label: 'الباركود', type: 'string', example: '6221234567890' },
      { key: 'category', label: 'القسم', type: 'string', example: 'جرابات' },
      { key: 'unit', label: 'الوحدة', type: 'string', example: 'piece' },
      { key: 'costPrice', label: 'سعر التكلفة', type: 'number', required: true, example: '50' },
      { key: 'sellingPrice', label: 'سعر البيع', type: 'number', required: true, example: '100' },
      { key: 'wholesalePrice', label: 'سعر الجملة', type: 'number', example: '75' },
      { key: 'halfWholesalePrice', label: 'سعر نص الجملة', type: 'number', example: '85' },
      { key: 'minStockLevel', label: 'حد الطلب', type: 'number', example: '5' },
      { key: 'taxRate', label: 'نسبة الضريبة', type: 'number', example: '0' },
      {
        key: 'initialQuantity',
        label: 'الكمية الافتتاحية',
        type: 'number',
        example: '10',
        createOnly: true,
      },
      { key: 'stock', label: 'المخزون الحالي', type: 'number', exportOnly: true },
    ],
  },
  customers: {
    entity: 'customers',
    labelAr: 'العملاء',
    feature: 'customers',
    viewPermission: 'customers.view',
    createPermission: 'customers.create',
    updatePermission: 'customers.update',
    matchBy: ['phone'],
    columns: [
      { key: 'name', label: 'الاسم', type: 'string', required: true, example: 'أحمد محمد' },
      { key: 'phone', label: 'الموبايل', type: 'string', example: '01000000000' },
      { key: 'email', label: 'البريد الإلكتروني', type: 'string', example: '' },
      { key: 'address', label: 'العنوان', type: 'string', example: 'شارع التحرير' },
      { key: 'city', label: 'المدينة', type: 'string', example: 'القاهرة' },
      { key: 'priceTier', label: 'شريحة السعر', type: 'string', example: 'retail' },
      { key: 'creditLimit', label: 'حد الائتمان', type: 'number', example: '0' },
      { key: 'taxNumber', label: 'الرقم الضريبي', type: 'string', example: '' },
      { key: 'notes', label: 'ملاحظات', type: 'string', example: '' },
      {
        key: 'previousBalance',
        label: 'الرصيد الافتتاحي',
        type: 'number',
        example: '0',
        createOnly: true,
      },
      { key: 'balance', label: 'الرصيد الحالي', type: 'number', exportOnly: true },
    ],
  },
  suppliers: {
    entity: 'suppliers',
    labelAr: 'الموردين',
    feature: 'suppliers',
    viewPermission: 'suppliers.view',
    createPermission: 'suppliers.create',
    updatePermission: 'suppliers.update',
    matchBy: ['phone'],
    columns: [
      { key: 'name', label: 'الاسم', type: 'string', required: true, example: 'شركة التوريدات' },
      { key: 'phone', label: 'الموبايل', type: 'string', example: '01100000000' },
      { key: 'email', label: 'البريد الإلكتروني', type: 'string', example: '' },
      { key: 'contactPerson', label: 'المسؤول', type: 'string', example: 'محمود' },
      { key: 'address', label: 'العنوان', type: 'string', example: '' },
      { key: 'city', label: 'المدينة', type: 'string', example: 'الجيزة' },
      { key: 'taxNumber', label: 'الرقم الضريبي', type: 'string', example: '' },
      { key: 'paymentTerms', label: 'شروط الدفع', type: 'string', example: 'آجل 30 يوم' },
      { key: 'notes', label: 'ملاحظات', type: 'string', example: '' },
      {
        key: 'previousBalance',
        label: 'الرصيد الافتتاحي',
        type: 'number',
        example: '0',
        createOnly: true,
      },
      { key: 'balance', label: 'الرصيد الحالي', type: 'number', exportOnly: true },
    ],
  },
};

export function isDataEntity(value: string): value is DataEntity {
  return Object.prototype.hasOwnProperty.call(DATA_ENTITIES, value);
}
