import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';

interface InventoryRow {
  id: string;
  quantity: number;
  availableQuantity: number;
  stockValue: number;
  status: string;
  product: { name: string; sku?: string; barcode?: string; minStockLevel?: number; category?: { name: string } };
  warehouse: { name: string };
}

const formatQuantity = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return Number.isInteger(number) ? String(number) : number.toLocaleString('ar-EG', { maximumFractionDigits: 4 });
};

const statusLabel: Record<string, { text: string; cls: string }> = {
  available: { text: 'متوفر', cls: 'bg-green-100 text-green-700' },
  low_stock: { text: 'على وشك النفاذ', cls: 'bg-orange-100 text-orange-700' },
  out_of_stock: { text: 'غير متوفر', cls: 'bg-red-100 text-red-700' },
};

export function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [res, cats] = await Promise.all([
        api.get('/inventory', { params: { search, categoryId: categoryFilter || undefined } }),
        api.get('/categories'),
      ]);
      setRows(res.data.data);
      setCategories(cats.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [categoryFilter]);

  const totalValue = rows.reduce((sum, r) => sum + Number(r.stockValue), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">المخزون</h1>
        <div className="bg-white rounded-lg shadow px-5 py-3">
          <span className="text-sm text-gray-500 ml-2">إجمالي رصيد المخزون:</span>
          <span className="text-xl font-bold text-primary">{totalValue.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالمنتج أو الرمز أو الباركود..." />
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
              <th className="text-right p-3">الرمز</th>
              <th className="text-right p-3">الصنف</th>
              <th className="text-right p-3">المخزن</th>
              <th className="text-right p-3">المتاح</th>
              <th className="text-right p-3">رصيد القيمة</th>
              <th className="text-right p-3">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد بيانات مخزون بعد — أضف منتجات وقم بعملية شراء أو تعديل مخزون</td></tr>
            )}
            {rows.map((r) => {
              const st = statusLabel[r.status] || statusLabel.available;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.product.name}</td>
                  <td className="p-3 text-gray-500">{r.product.sku || r.product.barcode || '-'}</td>
                  <td className="p-3 text-gray-500">{r.product.category?.name || '-'}</td>
                  <td className="p-3 text-gray-500">{r.warehouse.name}</td>
                  <td className="p-3 font-medium">{formatQuantity(r.availableQuantity)}</td>
                  <td className="p-3">{Number(r.stockValue).toFixed(2)}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded text-xs ${st.cls}`}>{st.text}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
