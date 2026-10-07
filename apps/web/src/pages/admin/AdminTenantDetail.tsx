import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

export function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [features, setFeatures] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [branding, setBranding] = useState<any>({ appName: '', logoUrl: '', primaryColor: '#0858A2', secondaryColor: '#64748B', sidebarColor: '#1E293B', headerColor: '#FFFFFF' });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = async () => {
    const [t, f, u, p, b] = await Promise.all([
      adminApi.get(`/admin/tenants/${id}`),
      adminApi.get(`/admin/tenants/${id}/features`),
      adminApi.get(`/admin/tenants/${id}/users`),
      adminApi.get('/admin/plans'),
      adminApi.get(`/admin/tenants/${id}/branding`),
    ]);
    setTenant(t.data.data);
    setFeatures(f.data.data);
    setUsers(u.data.data);
    setPlans(p.data.data);
    setBranding((current: any) => ({ ...current, ...b.data.data }));
    setEndDate(t.data.data.subscriptionEndDate ? t.data.data.subscriptionEndDate.slice(0, 10) : '');
  };
  useEffect(() => { load(); }, [id]);

  const toggleActive = async () => {
    await adminApi.patch(`/admin/tenants/${id}/status`, { isActive: !tenant.isActive });
    toast.success('تم تحديث الحالة');
    load();
  };

  const setStatus = async (subscriptionStatus: string) => {
    await adminApi.patch(`/admin/tenants/${id}/status`, { subscriptionStatus });
    toast.success('تم تحديث حالة الاشتراك');
    load();
  };

  const saveSubscription = async (planId?: string) => {
    await adminApi.put(`/admin/tenants/${id}/subscription`, {
      planId, subscriptionEndDate: endDate || undefined,
    });
    toast.success('تم تحديث الاشتراك');
    load();
  };

  const saveBranding = async () => {
    setBrandingSaving(true);
    try {
      await adminApi.put(`/admin/tenants/${id}/branding`, {
        appName: branding.appName,
        logoUrl: branding.logoUrl || undefined,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        sidebarColor: branding.sidebarColor,
        headerColor: branding.headerColor,
      });
      toast.success('تم حفظ هوية التاجر البصرية');
    } finally {
      setBrandingSaving(false);
    }
  };

  const toggleFeature = async (featureId: string, isEnabled: boolean) => {
    await adminApi.put(`/admin/tenants/${id}/features`, { features: [{ featureId, isEnabled }] });
    load();
  };

  const doResetPassword = async () => {
    if (!resetFor || newPassword.length < 8) { toast.error('كلمة المرور لازم 8 أحرف على الأقل'); return; }
    await adminApi.post(`/admin/tenants/${id}/reset-user-password`, { userId: resetFor, newPassword });
    toast.success('تم تغيير كلمة المرور');
    setResetFor(null); setNewPassword('');
  };

  if (!tenant) return <p className="text-gray-400">جاري التحميل...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{tenant.businessName}</h1>
        <p className="text-gray-500 text-sm">Tenant ID: {tenant.id}</p>
      </div>

      <div className="bg-white rounded-lg shadow p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold">هوية التاجر البصرية</h2>
          <p className="text-sm text-gray-500">هذه الإعدادات تظهر في لوحة التاجر، ولا يمكن للتاجر تعديلها.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><Label>اسم النظام / المتجر</Label><Input value={branding.appName || ''} onChange={(e) => setBranding({ ...branding, appName: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>رابط اللوجو</Label><Input placeholder="https://.../logo.png" value={branding.logoUrl || ''} onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })} /></div>
          <div><Label>اللون الأساسي</Label><div className="flex gap-2"><Input type="color" className="w-12 p-1" value={branding.primaryColor || '#0858A2'} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })} /><Input value={branding.primaryColor || ''} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })} /></div></div>
          <div><Label>اللون الثانوي</Label><div className="flex gap-2"><Input type="color" className="w-12 p-1" value={branding.secondaryColor || '#64748B'} onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })} /><Input value={branding.secondaryColor || ''} onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })} /></div></div>
          <div><Label>لون القائمة الجانبية</Label><div className="flex gap-2"><Input type="color" className="w-12 p-1" value={branding.sidebarColor || '#1E293B'} onChange={(e) => setBranding({ ...branding, sidebarColor: e.target.value })} /><Input value={branding.sidebarColor || ''} onChange={(e) => setBranding({ ...branding, sidebarColor: e.target.value })} /></div></div>
          <div><Label>لون الشريط العلوي</Label><div className="flex gap-2"><Input type="color" className="w-12 p-1" value={branding.headerColor || '#FFFFFF'} onChange={(e) => setBranding({ ...branding, headerColor: e.target.value })} /><Input value={branding.headerColor || ''} onChange={(e) => setBranding({ ...branding, headerColor: e.target.value })} /></div></div>
        </div>
        {branding.logoUrl && <img src={branding.logoUrl} alt="معاينة اللوجو" className="h-16 max-w-48 object-contain border rounded p-2" />}
        <Button onClick={saveBranding} disabled={brandingSaving}>{brandingSaving ? 'جاري الحفظ...' : 'حفظ الهوية البصرية'}</Button>
      </div>

      <div className="bg-white rounded-lg shadow p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div>
          <p className="text-sm text-gray-500 mb-2">تفعيل الحساب</p>
          <Button variant={tenant.isActive ? 'destructive' : 'default'} onClick={toggleActive}>
            {tenant.isActive ? 'إيقاف التاجر' : 'تفعيل التاجر'}
          </Button>
        </div>
        <div>
          <p className="text-sm text-gray-500 mb-2">حالة الاشتراك</p>
          <select
            className="border rounded-md h-10 px-3 w-full"
            value={tenant.subscriptionStatus}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="expired">expired</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
        <div>
          <Label>تاريخ نهاية الاشتراك</Label>
          <div className="flex gap-2">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Button onClick={() => saveSubscription()}>حفظ</Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5">
        <p className="font-medium mb-3">الخطة</p>
        <div className="flex gap-2 flex-wrap">
          {plans.map((p) => (
            <Button key={p.id} variant="outline" size="sm" onClick={() => saveSubscription(p.id)}>
              {p.nameAr} {p.priceMonthly ? `(${p.priceMonthly}/شهر)` : '(مجاني)'}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">الميزات المفعّلة</h2>
        <div className="bg-white rounded-lg shadow p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((f) => (
            <label key={f.id} className={`flex items-center gap-2 p-2 rounded border text-sm ${f.isCore ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={f.isEnabled}
                disabled={f.isCore}
                onChange={(e) => toggleFeature(f.id, e.target.checked)}
              />
              <span>{f.nameAr}</span>
              {f.requiresPlan && <span className="text-xs text-orange-500">(مدفوعة)</span>}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">مستخدمو هذا التاجر</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-right p-3">الاسم</th><th className="text-right p-3">البريد</th>
              <th className="text-right p-3">آخر دخول</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.fullName}</td>
                  <td className="p-3 text-gray-500">{u.email}</td>
                  <td className="p-3 text-gray-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar') : '-'}</td>
                  <td className="p-3">
                    {resetFor === u.id ? (
                      <div className="flex gap-2">
                        <Input className="h-8 w-40" placeholder="كلمة مرور جديدة" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                        <Button size="sm" onClick={doResetPassword}>حفظ</Button>
                        <Button size="sm" variant="ghost" onClick={() => setResetFor(null)}>إلغاء</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setResetFor(u.id)}>تغيير كلمة المرور</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
