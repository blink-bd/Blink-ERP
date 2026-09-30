import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

interface Stats {
  totalSales?: number;
  salesCount?: number;
}

export function DashboardPage() {
  const { t } = useTranslation('nav');
  const [stats, setStats] = useState<Stats>({});

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    api
      .get('/reports/sales', { params: { startDate: today, endDate: today } })
      .then((res) => setStats(res.data.data.summary))
      .catch(() => {});
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">{t('dashboard')}</h2>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">مبيعات اليوم</p>
          <p className="text-3xl font-bold text-primary">{Number(stats.totalSales || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">عدد فواتير اليوم</p>
          <p className="text-3xl font-bold">{stats.salesCount || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">الحالة</p>
          <p className="text-3xl font-bold text-green-600">متصل</p>
        </div>
      </div>

      <p className="text-gray-600">
        استخدم القائمة الجانبية للانتقال إلى نقطة البيع، المنتجات، المخزون، العملاء وباقي الشاشات.
      </p>
    </div>
  );
}
