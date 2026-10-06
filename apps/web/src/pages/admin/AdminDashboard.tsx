import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';

const Card = ({ label, value, tone = '' }: { label: string; value: any; tone?: string }) => (
  <div className="bg-white rounded-lg shadow p-5">
    <p className="text-sm text-gray-500">{label}</p>
    <p className={`text-3xl font-bold ${tone}`}>{value}</p>
  </div>
);

export function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    adminApi.get('/admin/dashboard').then((r) => setData(r.data.data));
    adminApi.get('/admin/audit-logs', { params: { limit: 15 } }).then((r) => setLogs(r.data.data));
  }, []);

  if (!data) return <p className="text-gray-400">جاري التحميل...</p>;
  const t = data.tenants;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">نظرة عامة</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="إجمالي التجّار" value={t.total} />
        <Card label="نشطون" value={t.active} tone="text-green-600" />
        <Card label="موقوفون" value={t.suspended} tone="text-orange-600" />
        <Card label="اشتراك منتهي" value={t.expired} tone="text-red-600" />
        <Card label="ينتهي خلال 7 أيام" value={t.expiringSoon} tone="text-yellow-600" />
        <Card label="تجّار جدد (30 يوم)" value={t.new30d} />
        <Card label="إجمالي المستخدمين" value={data.usersTotal} />
        <Card label="مبيعات المنصة (30 يوم)" value={Number(data.last30Days.salesTotal).toFixed(2)} />
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">آخر عمليات الإدارة</h2>
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-right p-3">الوقت</th><th className="text-right p-3">المدير</th>
              <th className="text-right p-3">العملية</th><th className="text-right p-3">IP</th>
            </tr></thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-gray-400">لا توجد عمليات</td></tr>}
              {logs.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-3 text-gray-500">{new Date(l.createdAt).toLocaleString('ar')}</td>
                  <td className="p-3">{l.adminEmail}</td>
                  <td className="p-3">{l.action}</td>
                  <td className="p-3 text-gray-500">{l.ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
