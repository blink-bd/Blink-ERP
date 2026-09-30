import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Purchase {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  total: number;
  paymentStatus: string;
}

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/purchases')
      .then((res) => setPurchases(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">المشتريات</h1>
      <p className="text-gray-500 mb-4 text-sm">
        لإنشاء أمر شراء جديد استخدم <code>POST /api/v1/purchases</code> (راجع docs/API.md) — يمكن إضافة نموذج
        كامل هنا بنفس نمط صفحة المنتجات.
      </p>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right p-3">رقم أمر الشراء</th>
              <th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">الإجمالي</th>
              <th className="text-right p-3">حالة الدفع</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>
            )}
            {!loading && purchases.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا توجد أوامر شراء بعد</td></tr>
            )}
            {purchases.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.purchaseNumber}</td>
                <td className="p-3 text-gray-500">{new Date(p.purchaseDate).toLocaleDateString('ar')}</td>
                <td className="p-3 font-medium">{Number(p.total).toFixed(2)}</td>
                <td className="p-3">{p.paymentStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
