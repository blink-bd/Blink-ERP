import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X, Pencil, AlertTriangle } from 'lucide-react';

interface Product {
  id: string; name: string; sku?: string; barcode?: string;
  sellingPrice: number; wholesalePrice?: number; costPrice: number;
  categoryId?: string; category?: { id: string; name: string };
  minStockLevel: number; isActive: boolean;
  availableQuantity: number | null; stockStatus: string;
  needsPriceReview?: boolean; priceReviewNote?: string;
}

const statusLabel: Record<string, { text: string; cls: string }> = {
  available: { text: 'متوفر', cls: 'bg-green-100 text-green-700' },
  low_stock: { text: 'على وشك النفاذ', cls: 'bg-orange-100 text-orange-700' },
  out_of_stock: { text: 'غير متوفر', cls: 'bg-red-100 text-red-700' },
  not_tracked: { text: '—', cls: 'bg-gray-100 text-gray-500' },
};

const emptyForm = {
  id: '', name: '', sku: '', barcode: '', costPrice: '', sellingPrice: '', wholesalePrice: '',
  minStockLevel: '5', categoryId: '', initialQuantity: '',
};

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const openCreate = () => { setForm(emptyForm); setShowForm(true); };
  const openEdit = (p: Product) => {
    setForm({
      id: p.id, name: p.name, sku: p.sku || '', barcode: p.barcode || '',
      costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice),
      wholesalePrice: p.wholesalePrice ? String(p.wholesalePrice) : '',
      minStockLevel: String(p.minStockLevel), categoryId: p.categoryId || '', initialQuantity: '',
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        costPrice: Number(form.costPrice) || 0,
        sellingPrice: Number(form.sellingPrice),
        wholesalePrice: form.wholesalePrice ? Number(form.wholesalePrice) : undefined,
        minStockLevel: Number(form.minStockLevel) || 0,
        categoryId: form.categoryId || undefined,
      };
      if (form.id) {
        await api.put(`/products/${form.id}`, payload);
        toast.success('تم تحديث المنتج بنجاح');
      } else {
        if (form.initialQuantity) payload.initialQuantity = Number(form.initialQuantity);
        await api.post('/products', payload);
        toast.success('تم إضافة المنتج بنجاح');
      }
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <Button onClick={showForm ? () => setShowForm(false) : openCreate}>
          {showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
          {showForm ? 'إلغاء' : 'إضافة منتج'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white p-5 rounded-lg shadow mb-6 grid grid-cols-3 gap-4">
          <div><Label>اسم المنتج</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>رمز المنتج (SKU)</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div><Label>الباركود</Label>
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>

          <div><Label>الصنف</Label>
            <select className="border rounded-md h-10 px-3 w-full" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">بدون صنف</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><Label>سعر التكلفة</Label>
            <Input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></div>
          <div><Label>الحد الأدنى للتنبيه</Label>
            <Input type="number" value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} /></div>

          <div><Label>سعر البيع القطاعي</Label>
            <Input type="number" step="0.01" required value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} /></div>
          <div><Label>سعر البيع بالجملة (اختياري)</Label>
            <Input type="number" step="0.01" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} /></div>
          {!form.id && (
            <div><Label>الكمية الافتتاحية (اختياري)</Label>
              <Input type="number" value={form.initialQuantity} onChange={(e) => setForm({ ...form, initialQuantity: e.target.value })} /></div>
          )}

          <div className="col-span-3 flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'حفظ المنتج'}</Button>
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">الصنف</th>
              <th className="text-right p-3">التكلفة</th>
              <th className="text-right p-3">قطاعي</th>
              <th className="text-right p-3">جملة</th>
              <th className="text-right p-3">المتاح</th>
              <th className="text-right p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
            {!loading && products.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد منتجات</td></tr>}
            {products.map((p) => {
              const st = statusLabel[p.stockStatus] || statusLabel.not_tracked;
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    {p.name}
                    {p.needsPriceReview && (
                      <span title={p.priceReviewNote} className="inline-flex items-center gap-1 text-xs text-orange-600 mr-2">
                        <AlertTriangle className="h-3 w-3" /> راجع السعر
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500">{p.category?.name || '-'}</td>
                  <td className="p-3">{Number(p.costPrice).toFixed(2)}</td>
                  <td className="p-3 font-medium">{Number(p.sellingPrice).toFixed(2)}</td>
                  <td className="p-3 text-gray-500">{p.wholesalePrice ? Number(p.wholesalePrice).toFixed(2) : '-'}</td>
                  <td className="p-3">{p.availableQuantity ?? '-'}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded text-xs ${st.cls}`}>{st.text}</span></td>
                  <td className="p-3">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
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
