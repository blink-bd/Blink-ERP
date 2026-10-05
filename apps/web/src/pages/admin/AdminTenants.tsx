import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';

interface Tenant {
  id: string; businessName: string; email: string; isActive: boolean;
  subscriptionStatus: string; subscriptionEndDate?: string;
}

const statusBadge: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-700',
};

export function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    businessName: '', businessNameAr: '', email: '', phone: '',
    adminFullName: '', adminEmail: '', adminPassword: '',
  });

  const restore = async (file: File) => {
    const data = new FormData(); data.append('file', file);
    await adminApi.post('/admin/tenants/restore', data, { headers: { 'Content-Type': 'multipart/form-data' } });
    toast.success('تمت استعادة التاجر'); load();
  };

  const load = () => {
    setLoading(true);
    adminApi.get('/admin/tenants').then((r) => setTenants(r.data.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await adminApi.post('/admin/tenants', {
        businessName: form.businessName,
        businessNameAr: form.businessNameAr || form.businessName,
        email: form.email,
        phone: form.phone || undefined,
        adminUser: { fullName: form.adminFullName, email: form.adminEmail, password: form.adminPassword },
      });
      toast.success(`تم إنشاء التاجر. Tenant ID: ${res.data.data.tenant.id}`);
      setShowForm(false);
      setForm({ businessName: '', businessNameAr: '', email: '', phone: '', adminFullName: '', adminEmail: '', adminPassword: '' });
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">التجّار</h1>
        <label className="inline-flex items-center cursor-pointer border rounded px-3 py-2 text-sm"><span>استعادة نسخة JSON</span><input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} /></label>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
          {showForm ? 'إلغاء' : 'إضافة تاجر جديد'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white p-5 rounded-lg shadow mb-6 grid grid-cols-2 gap-4">
          <div><Label>اسم النشاط التجاري</Label>
            <Input required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></div>
          <div><Label>الاسم بالعربي</Label>
            <Input value={form.businessNameAr} onChange={(e) => setForm({ ...form, businessNameAr: e.target.value })} /></div>
          <div><Label>بريد النشاط</Label>
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>الهاتف</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="col-span-2 border-t pt-4"><p className="font-medium text-sm text-gray-600 mb-2">حساب مدير المتجر (Admin) الأول</p></div>
          <div><Label>اسم المدير</Label>
            <Input required value={form.adminFullName} onChange={(e) => setForm({ ...form, adminFullName: e.target.value })} /></div>
          <div><Label>بريد المدير (للدخول)</Label>
            <Input type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} /></div>
          <div><Label>كلمة مرور مؤقتة</Label>
            <Input type="text" required minLength={8} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} /></div>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? 'جاري الإنشاء...' : 'إنشاء التاجر'}</Button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="text-right p-3">الاسم</th><th className="text-right p-3">البريد</th>
            <th className="text-right p-3">الحالة</th><th className="text-right p-3">نهاية الاشتراك</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
            {!loading && tenants.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">لا يوجد تجّار بعد</td></tr>}
            {tenants.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-3">{t.businessName}</td>
                <td className="p-3 text-gray-500">{t.email}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs ${statusBadge[t.subscriptionStatus] || 'bg-gray-100'}`}>
                    {!t.isActive ? 'موقوف' : t.subscriptionStatus}
                  </span>
                </td>
                <td className="p-3 text-gray-500">{t.subscriptionEndDate ? new Date(t.subscriptionEndDate).toLocaleDateString('ar') : '-'}</td>
                <td className="p-3"><Link to={`/admin/tenants/${t.id}`} className="text-primary text-sm hover:underline">إدارة</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
