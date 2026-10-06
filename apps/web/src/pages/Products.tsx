import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X, Pencil, Trash2, Barcode as BarcodeIcon, Printer } from 'lucide-react';
import { useFeature } from '@/contexts/FeaturesContext';
import { printBarcodeLabel } from '@/lib/barcode';

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  sellingPrice: number;
  wholesalePrice?: number;
  halfWholesalePrice?: number;
  costPrice: number;
  categoryId?: string;
  category?: { id: string; name: string };
  minStockLevel: number;
  isActive: boolean;
  availableQuantity: number | null;
  openingQuantity: number | null;
  stockStatus: string;
  needsPriceReview?: boolean;
  priceReviewNote?: string;
}

type ProductForm = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  halfWholesalePrice: string;
  minStockLevel: string;
  categoryId: string;
  initialQuantity: string;
  originalInitialQuantity: string;
  needsPriceReview: boolean;
};

const statusLabel: Record<string, { text: string; cls: string }> = {
  available: { text: 'متوفر', cls: 'bg-green-100 text-green-700' },
  low_stock: { text: 'على وشك النفاذ', cls: 'bg-orange-100 text-orange-700' },
  out_of_stock: { text: 'غير متوفر', cls: 'bg-red-100 text-red-700' },
  not_tracked: { text: '—', cls: 'bg-gray-100 text-gray-500' },
};

const emptyForm: ProductForm = {
  id: '', name: '', sku: '', barcode: '', costPrice: '', sellingPrice: '', wholesalePrice: '',
  halfWholesalePrice: '',
  minStockLevel: '5', categoryId: '', initialQuantity: '', originalInitialQuantity: '', needsPriceReview: false,
};

const formatQuantity = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return Number.isInteger(number) ? String(number) : number.toLocaleString('ar-EG', { maximumFractionDigits: 4 });
};

export function ProductsPage() {
  const halfWholesaleEnabled = useFeature('half_wholesale_pricing');
  const barcodePrintingEnabled = useFeature('barcode_printing');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [identifierStatus, setIdentifierStatus] = useState({ skuAvailable: true, barcodeAvailable: true });
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api.get('/products', { params: { search, categoryId: categoryFilter || undefined, limit: 200 } }),
        api.get('/categories'),
      ]);
      setProducts(p.data.data);
      setCategories(c.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [categoryFilter]);

  useEffect(() => {
    if (!showForm || (!form.sku.trim() && !form.barcode.trim())) {
      setIdentifierStatus({ skuAvailable: true, barcodeAvailable: true });
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get('/products/check-identifiers', {
          params: {
            sku: form.sku.trim() || undefined,
            barcode: form.barcode.trim() || undefined,
            excludeId: form.id || undefined,
          },
        });
        setIdentifierStatus(response.data.data);
      } catch {
        // يعرض interceptor رسالة الخطأ عند الحاجة، ولا نوقف الكتابة.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form.sku, form.barcode, form.id, showForm]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const openCreate = () => { setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (p: Product) => {
    const currentQuantity = p.openingQuantity === null || p.openingQuantity === undefined ? '' : String(p.openingQuantity);
    setForm({
      id: p.id, name: p.name, sku: p.sku || '', barcode: p.barcode || '',
      costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice),
      wholesalePrice: p.wholesalePrice !== undefined && p.wholesalePrice !== null ? String(p.wholesalePrice) : '',
      halfWholesalePrice: p.halfWholesalePrice !== undefined && p.halfWholesalePrice !== null ? String(p.halfWholesalePrice) : '',
      minStockLevel: String(p.minStockLevel), categoryId: p.categoryId || '',
      initialQuantity: currentQuantity, originalInitialQuantity: currentQuantity,
      needsPriceReview: !!p.needsPriceReview,
    });
    setShowForm(true);
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    try {
      const response = await api.post('/categories', { name: newCategoryName.trim() });
      const category = response.data.data;
      setCategories((previous) => [...previous, category]);
      setForm((previous) => ({ ...previous, categoryId: category.id }));
      setNewCategoryName('');
      toast.success('تمت إضافة الصنف');
    } finally {
      setAddingCategory(false);
    }
  };

  const generateBarcode = async () => {
    setGeneratingBarcode(true);
    try {
      const response = await api.get('/products/generate-barcode');
      const barcode = response.data.data.barcode as string;
      setForm((previous) => ({ ...previous, barcode }));
      toast.success('تم توليد باركود جديد وغير مكرر');
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const printLabel = () => {
    if (!form.barcode.trim()) {
      toast.error('يجب إدخال أو توليد باركود أولاً');
      return;
    }
    printBarcodeLabel({ name: form.name.trim() || 'منتج', barcode: form.barcode.trim() });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cost = Number(form.costPrice) || 0;
    const retail = Number(form.sellingPrice);
    const wholesale = form.wholesalePrice === '' ? undefined : Number(form.wholesalePrice);
    const halfWholesale = !halfWholesaleEnabled || form.halfWholesalePrice === ''
      ? undefined
      : Number(form.halfWholesalePrice);
    if (!Number.isFinite(retail) || retail <= cost) {
      toast.error('سعر البيع القطاعي يجب أن يكون أكبر من سعر التكلفة');
      return;
    }
    if (wholesale !== undefined && (!Number.isFinite(wholesale) || wholesale <= cost)) {
      toast.error('سعر البيع بالجملة يجب أن يكون أكبر من سعر التكلفة');
      return;
    }
    if (halfWholesale !== undefined && (!Number.isFinite(halfWholesale) || halfWholesale <= cost)) {
      toast.error('سعر نصف الجملة يجب أن يكون أكبر من سعر التكلفة');
      return;
    }
    if (!identifierStatus.skuAvailable || !identifierStatus.barcodeAvailable) {
      toast.error('لا يمكن حفظ المنتج: رمز المنتج أو الباركود مستخدم بالفعل');
      return;
    }

    const openingChanged = !!form.id && form.initialQuantity !== form.originalInitialQuantity;
    let openingQuantityReason = '';
    if (openingChanged) {
      if (!window.confirm('سيتم تعديل الكمية الافتتاحية وتسجيل العملية في حركة المخزون. هل تريد المتابعة؟')) return;
      openingQuantityReason = window.prompt('اكتب سبب تعديل الكمية الافتتاحية لضمان سلامة السجل:')?.trim() || '';
      if (!openingQuantityReason) {
        toast.error('يجب كتابة سبب تعديل الكمية الافتتاحية');
        return;
      }
    }

    let confirmPriceReview = false;
    if (form.id && form.needsPriceReview) {
      if (!window.confirm('تم تغيير سعر التكلفة سابقاً. هل راجعت أسعار البيع وتريد تأكيد حفظ المراجعة؟')) return;
      confirmPriceReview = true;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        costPrice: cost,
        sellingPrice: retail,
        wholesalePrice: wholesale,
        halfWholesalePrice: halfWholesale,
        minStockLevel: Number(form.minStockLevel) || 0,
        categoryId: form.categoryId || undefined,
      };
      if (form.id) {
        if (openingChanged && form.initialQuantity !== '') payload.initialQuantity = Number(form.initialQuantity);
        if (openingChanged) {
          payload.confirmOpeningQuantityChange = true;
          payload.openingQuantityReason = openingQuantityReason;
        }
        if (confirmPriceReview) payload.confirmPriceReview = true;
        await api.put(`/products/${form.id}`, payload);
        toast.success('تم تحديث المنتج بنجاح');
      } else {
        if (form.initialQuantity !== '') payload.initialQuantity = Number(form.initialQuantity);
        await api.post('/products', payload);
        toast.success('تمت إضافة المنتج بنجاح');
      }
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async (product: Product) => {
    if (!window.confirm(`هل أنت متأكد من حذف المنتج «${product.name}»؟`)) return;
    await api.delete(`/products/${product.id}`);
    toast.success('تم حذف المنتج');
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <Button onClick={showForm ? () => setShowForm(false) : openCreate}>
          {showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
          {showForm ? 'إلغاء' : 'إضافة منتج'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white p-5 rounded-lg shadow mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><Label>اسم المنتج</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>رمز المنتج (SKU)</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            {!identifierStatus.skuAvailable && <p className="text-xs text-red-600 mt-1">رمز المنتج موجود مسبقاً</p>}
          </div>
          <div>
            <Label>الباركود</Label>
            {/* قارئ الباركود يرسل Enter تلقائياً بعد قراءة الرقم، لذلك نمنع الإرسال التلقائي للنموذج هنا فقط
                مع إبقاء إدخال الباركود وحفظ المنتج عبر زر الحفظ يعملان بشكل طبيعي */}
            <div className="flex gap-2">
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon" title="توليد تلقائي" disabled={generatingBarcode} onClick={generateBarcode}>
                <BarcodeIcon className="h-4 w-4" />
              </Button>
              {barcodePrintingEnabled && form.barcode.trim() && (
                <Button type="button" variant="outline" size="icon" title="طباعة الملصق" onClick={printLabel}>
                  <Printer className="h-4 w-4" />
                </Button>
              )}
            </div>
            {!identifierStatus.barcodeAvailable && <p className="text-xs text-red-600 mt-1">الباركود موجود مسبقاً</p>}
          </div>

          <div>
            <Label>الصنف</Label>
            <div className="flex gap-2">
              <select className="border rounded-md h-10 px-3 w-full" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">بدون صنف</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button type="button" size="icon" variant="outline" title="إضافة صنف" onClick={() => document.getElementById('new-category-name')?.focus()}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-2 mt-2">
              <Input id="new-category-name" placeholder="اكتب اسم صنف جديد" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
              <Button type="button" size="sm" variant="outline" disabled={addingCategory || !newCategoryName.trim()} onClick={addCategory}>إضافة</Button>
            </div>
          </div>
          <div><Label>سعر التكلفة</Label>
            <Input type="number" step="0.01" min="0" required value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></div>
          <div><Label>الحد الأدنى للتنبيه</Label>
            <Input type="number" min="0" value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} /></div>

          <div><Label>سعر البيع القطاعي</Label>
            <Input type="number" step="0.01" min="0.01" required value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} /></div>
          {halfWholesaleEnabled && (
            <div><Label>سعر نصف الجملة (اختياري)</Label>
              <Input type="number" step="0.01" min="0" value={form.halfWholesalePrice} onChange={(e) => setForm({ ...form, halfWholesalePrice: e.target.value })} />
            </div>
          )}
          <div><Label>سعر البيع بالجملة (اختياري)</Label>
            <Input type="number" step="0.01" min="0" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} /></div>
          <div><Label>{form.id ? 'الكمية الافتتاحية / الحالية' : 'الكمية الافتتاحية (اختياري)'}</Label>
            <Input type="number" step="0.0001" min="0" value={form.initialQuantity} onChange={(e) => setForm({ ...form, initialQuantity: e.target.value })} />
            {form.id && <p className="text-xs text-gray-500 mt-1">تغييرها يحتاج تأكيداً وسبباً ويُسجل في حركة المخزون.</p>}
          </div>

          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <Button type="submit" disabled={saving || !identifierStatus.skuAvailable || !identifierStatus.barcodeAvailable}>{saving ? 'جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'حفظ المنتج'}</Button>
          </div>
        </form>
      )}

      <div className="flex gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرمز أو الباركود..." />
        </form>
        <select className="border rounded-md h-10 px-3" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">كل الأصناف</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">رمز المنتج</th>
              <th className="text-right p-3">الباركود</th>
              <th className="text-right p-3">الصنف</th>
              <th className="text-right p-3">التكلفة</th>
              <th className="text-right p-3">قطاعي</th>
              {halfWholesaleEnabled && <th className="text-right p-3">نصف جملة</th>}
              <th className="text-right p-3">جملة</th>
              <th className="text-right p-3">المتاح</th>
              <th className="text-right p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={halfWholesaleEnabled ? 11 : 10} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
            {!loading && products.length === 0 && <tr><td colSpan={halfWholesaleEnabled ? 11 : 10} className="text-center py-8 text-gray-400">لا توجد منتجات</td></tr>}
            {products.map((p) => {
              const st = statusLabel[p.stockStatus] || statusLabel.not_tracked;
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-3">{p.name}</td>
                  <td className="p-3 text-gray-500">{p.sku || '-'}</td>
                  <td className="p-3 text-gray-500">{p.barcode || '-'}</td>
                  <td className="p-3 text-gray-500">{p.category?.name || '-'}</td>
                  <td className="p-3">{Number(p.costPrice).toFixed(2)}</td>
                  <td className="p-3 font-medium">{Number(p.sellingPrice).toFixed(2)}</td>
                  {halfWholesaleEnabled && <td className="p-3 text-gray-500">{p.halfWholesalePrice !== undefined && p.halfWholesalePrice !== null ? Number(p.halfWholesalePrice).toFixed(2) : '-'}</td>}
                  <td className="p-3 text-gray-500">{p.wholesalePrice !== undefined && p.wholesalePrice !== null ? Number(p.wholesalePrice).toFixed(2) : '-'}</td>
                  <td className="p-3">{formatQuantity(p.availableQuantity)}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded text-xs ${st.cls}`}>{st.text}</span></td>
                  <td className="p-3 flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                    {barcodePrintingEnabled && p.barcode && (
                      <Button size="icon" variant="ghost" onClick={() => printBarcodeLabel({ name: p.name, barcode: p.barcode! })} title="طباعة الملصق"><Printer className="h-4 w-4" /></Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => removeProduct(p)} title="حذف"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
