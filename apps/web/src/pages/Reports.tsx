import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Tab = 'sales' | 'purchases' | 'expenses';

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('sales');
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runReport = async (which: Tab = tab) => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/${which}`, { params: { startDate, endDate } });
      setReport(res.data.data);
      setTab(which);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">التقارير</h1>

      <div className="flex gap-2 mb-4">
        {(['sales', 'purchases', 'expenses'] as Tab[]).map((t) => (
          <button key={t} onClick={() => runReport(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab === t ? 'bg-primary text-white' : 'bg-white border'}`}>
            {t === 'sales' ? 'تقرير المبيعات' : t === 'purchases' ? 'تقرير المشتريات' : 'تقرير المصروفات'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-5 mb-6 flex items-end gap-4">
        <div><Label>من تاريخ</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div><Label>إلى تاريخ</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <Button onClick={() => runReport()} disabled={loading}>{loading ? 'جاري التحميل...' : 'تحديث'}</Button>
      </div>

      {report && tab === 'sales' && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">عدد الفواتير</p><p className="text-2xl font-bold">{report.summary.salesCount}</p></div>
          <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">إجمالي المبيعات</p><p className="text-2xl font-bold">{Number(report.summary.totalSales).toFixed(2)}</p></div>
          <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">إجمالي الربح</p><p className="text-2xl font-bold text-green-600">{Number(report.summary.grossProfit).toFixed(2)}</p></div>
          <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">إجمالي الضريبة</p><p className="text-2xl font-bold">{Number(report.summary.totalTax).toFixed(2)}</p></div>
        </div>
      )}

      {report && tab === 'purchases' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">عدد أوامر الشراء</p><p className="text-2xl font-bold">{report.summary.purchasesCount}</p></div>
            <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">إجمالي المشتريات</p><p className="text-2xl font-bold">{Number(report.summary.totalPurchases).toFixed(2)}</p></div>
            <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">متبقي للموردين</p><p className="text-2xl font-bold text-orange-600">{Number(report.summary.totalRemaining).toFixed(2)}</p></div>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="text-right p-3">المورد</th><th className="text-right p-3">عدد الفواتير</th><th className="text-right p-3">الإجمالي</th></tr></thead>
              <tbody>{report.bySupplier.map((s: any) => (
                <tr key={s.supplierId} className="border-t"><td className="p-3">{s.supplierName}</td><td className="p-3">{s.purchasesCount}</td><td className="p-3 font-medium">{Number(s.total).toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      {report && tab === 'expenses' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">عدد المصروفات</p><p className="text-2xl font-bold">{report.summary.expensesCount}</p></div>
            <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">الإجمالي</p><p className="text-2xl font-bold text-red-600">{Number(report.summary.total).toFixed(2)}</p></div>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="text-right p-3">الفئة</th><th className="text-right p-3">العدد</th><th className="text-right p-3">الإجمالي</th></tr></thead>
              <tbody>{report.byCategory.map((c: any, i: number) => (
                <tr key={i} className="border-t"><td className="p-3">{c.category}</td><td className="p-3">{c.count}</td><td className="p-3 font-medium">{Number(c.total).toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
