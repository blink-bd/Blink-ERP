import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ReportsPage() {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runReport = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/sales', { params: { startDate, endDate } });
      setReport(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">التقارير</h1>
      <div className="bg-white rounded-lg shadow p-5 mb-6 flex items-end gap-4">
        <div>
          <Label>من تاريخ</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>إلى تاريخ</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button onClick={runReport} disabled={loading}>
          {loading ? 'جاري التحميل...' : 'عرض تقرير المبيعات'}
        </Button>
      </div>

      {report && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">عدد الفواتير</p>
            <p className="text-2xl font-bold">{report.summary.salesCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">إجمالي المبيعات</p>
            <p className="text-2xl font-bold">{Number(report.summary.totalSales).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">إجمالي الربح</p>
            <p className="text-2xl font-bold text-green-600">{Number(report.summary.grossProfit).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">إجمالي الضريبة</p>
            <p className="text-2xl font-bold">{Number(report.summary.totalTax).toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
