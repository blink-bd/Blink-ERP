import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { AlertTriangle } from 'lucide-react';

interface Summary {
  salesToday: { invoicesCount: number; totalSales: number };
  expensesToday: { count: number; total: number };
  lowStockAlerts: { id: string; name: string; sku?: string; availableQuantity: number; status: string }[];
  customerInvoices: { count: number; totalOwed: number };
  supplierInvoices: { count: number; totalOwed: number };
}

const Card = ({ label, value, tone = '', sub }: { label: string; value: any; tone?: string; sub?: string }) => (
  <div className="bg-white rounded-lg shadow p-5">
    <p className="text-sm text-gray-500">{label}</p>
    <p className={`text-3xl font-bold ${tone}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

export function DashboardPage() {
  const { t } = useTranslation('nav');
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    api.get('/dashboard/summary').then((res) => setData(res.data.data)).catch(() => {});
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">{t('dashboard')}</h2>

      {!data ? (
        <p className="text-gray-400">جاري التحميل...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <Card label="مبيعات اليوم" value={data.salesToday.totalSales.toFixed(2)} tone="text-primary" sub={`${data.salesToday.invoicesCount} فاتورة`} />
            <Card label="مصروفات اليوم" value={data.expensesToday.total.toFixed(2)} tone="text-red-600" sub={`${data.expensesToday.count} عملية`} />
            <Card label="صافي اليوم" value={(data.salesToday.totalSales - data.expensesToday.total).toFixed(2)} tone="text-green-600" />
            <Link to="/customers">
              <Card label="مستحق من العملاء" value={data.customerInvoices.totalOwed.toFixed(2)} tone="text-orange-600" sub={`${data.customerInvoices.count} فاتورة آجلة`} />
            </Link>
            <Link to="/suppliers">
              <Card label="مستحق للموردين" value={data.supplierInvoices.totalOwed.toFixed(2)} tone="text-orange-600" sub={`${data.supplierInvoices.count} فاتورة آجلة`} />
            </Link>
            <Card label="منتجات بحاجة لانتباه" value={data.lowStockAlerts.length} tone="text-red-600" />
          </div>

          {data.lowStockAlerts.length > 0 && (
            <div className="bg-white rounded-lg shadow p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                تنبيهات المخزون
              </h3>
              <div className="space-y-2">
                {data.lowStockAlerts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2">
                    <span>{p.name} {p.sku && <span className="text-gray-400">({p.sku})</span>}</span>
                    <span className={`px-2 py-1 rounded text-xs ${p.status === 'out_of_stock' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {p.status === 'out_of_stock' ? 'غير متوفر' : `على وشك النفاذ (${p.availableQuantity})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
