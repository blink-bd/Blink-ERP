import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';

interface InventoryRow {
  id: string;
  quantity: number;
  availableQuantity: number;
  product: { name: string; sku?: string; minStockLevel?: number };
  warehouse: { name: string };
}

export function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory', { params: { search } });
      setRows(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">المخزون</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mb-4"
      >
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالمنتج..." />
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">المخزن</th>
              <th className="text-right p-3">الرصيد الكلي</th>
              <th className="text-right p-3">المتاح</th>
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
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  لا توجد بيانات مخزون بعد — أضف منتجات وقم بعملية شراء أو تعديل مخزون
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const low = (r.product.minStockLevel || 0) >= r.availableQuantity;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.product.name}</td>
                  <td className="p-3 text-gray-500">{r.warehouse.name}</td>
                  <td className="p-3">{r.quantity}</td>
                  <td className="p-3 font-medium">{r.availableQuantity}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        low ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {low ? 'مخزون منخفض' : 'متوفر'}
                    </span>
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
