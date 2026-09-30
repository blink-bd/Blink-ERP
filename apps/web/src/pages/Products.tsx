import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  sellingPrice: number;
  costPrice: number;
  isActive: boolean;
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', barcode: '', costPrice: '', sellingPrice: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products', { params: { search } });
      setProducts(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/products', {
        name: form.name,
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        costPrice: Number(form.costPrice) || 0,
        sellingPrice: Number(form.sellingPrice),
      });
      toast.success('تم إضافة المنتج بنجاح');
      setShowForm(false);
      setForm({ name: '', sku: '', barcode: '', costPrice: '', sellingPrice: '' });
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
          {showForm ? 'إلغاء' : 'إضافة منتج'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white p-5 rounded-lg shadow mb-6 grid grid-cols-2 gap-4">
          <div>
            <Label>اسم المنتج</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>رمز المنتج (SKU)</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <Label>الباركود</Label>
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </div>
          <div>
            <Label>سعر التكلفة</Label>
            <Input
              type="number"
              step="0.01"
              value={form.costPrice}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            />
          </div>
          <div>
            <Label>سعر البيع</Label>
            <Input
              type="number"
              step="0.01"
              required
              value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
            />
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ المنتج'}
            </Button>
          </div>
        </form>
      )}

      <form onSubmit={handleSearch} className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الرمز أو الباركود..."
        />
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">الرمز</th>
              <th className="text-right p-3">سعر التكلفة</th>
              <th className="text-right p-3">سعر البيع</th>
              <th className="text-right p-3">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  جاري التحميل...
                </td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  لا توجد منتجات بعد
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.name}</td>
                <td className="p-3 text-gray-500">{p.sku || '-'}</td>
                <td className="p-3">{Number(p.costPrice).toFixed(2)}</td>
                <td className="p-3 font-medium">{Number(p.sellingPrice).toFixed(2)}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.isActive ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
