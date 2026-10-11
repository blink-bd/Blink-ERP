import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { auditLabel, formatDateTime, severityClass } from '@/lib/audit-labels';

interface Usage {
  usage: {
    users: number;
    activeUsers: number;
    branches: number;
    warehouses: number;
    products: number;
    activeApiKeys: number;
    failedLogins24h: number;
  };
  limits: {
    maxUsers: number | null;
    maxBranches: number | null;
    maxWarehouses: number | null;
    maxProducts: number | null;
  };
}
const limitInput = (v: number | null | undefined) =>
  v === null || v === undefined ? '' : String(v);

const TIMEZONES = [
  ['Africa/Cairo', 'مصر (القاهرة)'],
  ['Asia/Riyadh', 'السعودية (الرياض)'],
  ['Asia/Dubai', 'الإمارات (دبي)'],
  ['Asia/Kuwait', 'الكويت'],
  ['Asia/Qatar', 'قطر'],
  ['Asia/Bahrain', 'البحرين'],
  ['Asia/Muscat', 'عُمان'],
  ['Asia/Amman', 'الأردن'],
  ['Asia/Baghdad', 'العراق'],
  ['Africa/Tripoli', 'ليبيا'],
  ['Africa/Casablanca', 'المغرب'],
  ['Europe/Istanbul', 'تركيا'],
  ['UTC', 'UTC'],
];
const CURRENCIES = [
  ['EGP', 'جنيه مصري'],
  ['SAR', 'ريال سعودي'],
  ['AED', 'درهم إماراتي'],
  ['KWD', 'دينار كويتي'],
  ['QAR', 'ريال قطري'],
  ['BHD', 'دينار بحريني'],
  ['OMR', 'ريال عماني'],
  ['JOD', 'دينار أردني'],
  ['IQD', 'دينار عراقي'],
  ['LYD', 'دينار ليبي'],
  ['MAD', 'درهم مغربي'],
  ['TRY', 'ليرة تركية'],
  ['USD', 'دولار أمريكي'],
];

export function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [features, setFeatures] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [branding, setBranding] = useState<any>({
    appName: '',
    logoUrl: '',
    primaryColor: '#0858A2',
    secondaryColor: '#64748B',
    sidebarColor: '#1E293B',
    headerColor: '#FFFFFF',
    footerText: 'Copyright © 2026 Blink BD',
    footerLinkUrl: '',
  });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [subscriptionAmount, setSubscriptionAmount] = useState('');
  const [subscriptionCycle, setSubscriptionCycle] = useState('monthly');
  const [subscriptionNote, setSubscriptionNote] = useState('');
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [limitsForm, setLimitsForm] = useState({
    maxUsers: '',
    maxBranches: '',
    maxWarehouses: '',
    maxProducts: '',
  });
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [regional, setRegional] = useState({
    timezone: 'Africa/Cairo',
    currency: 'EGP',
    country: '',
  });
  const [regionalSaving, setRegionalSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditFilter, setAuditFilter] = useState('');

  const load = async () => {
    const [t, f, u, b] = await Promise.all([
      adminApi.get(`/admin/tenants/${id}`),
      adminApi.get(`/admin/tenants/${id}/features`),
      adminApi.get(`/admin/tenants/${id}/users`),
      adminApi.get(`/admin/tenants/${id}/branding`),
    ]);
    setTenant(t.data.data);
    setFeatures(f.data.data);
    setUsers(u.data.data);
    setBranding((current: any) => ({ ...current, ...b.data.data }));
    setEndDate(t.data.data.subscriptionEndDate ? t.data.data.subscriptionEndDate.slice(0, 10) : '');
    setSubscriptionAmount(
      t.data.data.subscriptionAmount != null ? String(t.data.data.subscriptionAmount) : ''
    );
    setSubscriptionCycle(t.data.data.subscriptionCycle || 'monthly');
    setSubscriptionNote(t.data.data.subscriptionNote || '');
    setRegional({
      timezone: t.data.data.timezone || 'Africa/Cairo',
      currency: t.data.data.currency || 'EGP',
      country: t.data.data.country || '',
    });
    loadUsage();
  };
  const loadUsage = async () => {
    try {
      const r = await adminApi.get(`/admin/tenants/${id}/usage`);
      setUsage(r.data.data);
      const l = r.data.data.limits;
      setLimitsForm({
        maxUsers: limitInput(l.maxUsers),
        maxBranches: limitInput(l.maxBranches),
        maxWarehouses: limitInput(l.maxWarehouses),
        maxProducts: limitInput(l.maxProducts),
      });
    } catch {
      /* interceptor */
    }
  };
  const loadAudit = async (action = auditFilter) => {
    try {
      const r = await adminApi.get(`/admin/tenants/${id}/audit-logs`, {
        params: { limit: 200, action: action || undefined },
      });
      setAuditLogs(r.data.data);
    } catch {
      /* interceptor */
    }
  };
  useEffect(() => {
    load();
    loadAudit('');
  }, [id]);

  const saveLimits = async () => {
    const parse = (v: string) => (v.trim() === '' ? null : Math.max(1, Math.floor(Number(v))));
    setLimitsSaving(true);
    try {
      await adminApi.put(`/admin/tenants/${id}/limits`, {
        maxUsers: parse(limitsForm.maxUsers),
        maxBranches: parse(limitsForm.maxBranches),
        maxWarehouses: parse(limitsForm.maxWarehouses),
        maxProducts: parse(limitsForm.maxProducts),
      });
      toast.success('تم تحديث حدود الحساب');
      loadUsage();
    } catch {
      /* interceptor */
    } finally {
      setLimitsSaving(false);
    }
  };

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

  const saveSubscription = async () => {
    await adminApi.put(`/admin/tenants/${id}/subscription`, {
      subscriptionEndDate: endDate || undefined,
    });
    toast.success('تم تحديث الاشتراك');
    load();
  };

  const saveSale = async () => {
    if (subscriptionAmount && Number(subscriptionAmount) < 0) {
      toast.error('المبلغ غير صحيح');
      return;
    }
    setSubscriptionSaving(true);
    try {
      await adminApi.put(`/admin/tenants/${id}/subscription`, {
        subscriptionAmount: subscriptionAmount ? Number(subscriptionAmount) : undefined,
        subscriptionCycle,
        subscriptionNote,
      });
      toast.success('تم حفظ بيانات البيع للتاجر');
      load();
    } finally {
      setSubscriptionSaving(false);
    }
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
        footerText: branding.footerText,
        footerLinkUrl: branding.footerLinkUrl || undefined,
      });
      toast.success('تم حفظ هوية التاجر البصرية');
    } finally {
      setBrandingSaving(false);
    }
  };

  const saveRegional = async () => {
    setRegionalSaving(true);
    try {
      await adminApi.put(`/admin/tenants/${id}`, {
        timezone: regional.timezone,
        currency: regional.currency,
        country: regional.country.trim() || undefined,
      });
      toast.success('تم حفظ الإعدادات الإقليمية');
    } catch {
      /* interceptor */
    } finally {
      setRegionalSaving(false);
    }
  };

  const toggleFeature = async (featureId: string, isEnabled: boolean) => {
    try {
      const r = await adminApi.put(`/admin/tenants/${id}/features`, {
        features: [{ featureId, isEnabled }],
      });
      setFeatures(r.data.data);
      const target = features.find((f) => f.id === featureId)?.code;
      const cascaded = (r.data.changes || []).filter((c: any) => c.code !== target);
      if (cascaded.length) {
        const names = cascaded
          .map((c: any) => r.data.data.find((f: any) => f.code === c.code)?.nameAr || c.code)
          .join('، ');
        toast.success(
          isEnabled
            ? `تم التفعيل مع المتطلبات: ${names}`
            : `تم الإيقاف مع الميزات المعتمدة عليها: ${names}`,
          { duration: 6000 }
        );
      } else {
        toast.success(isEnabled ? 'تم التفعيل' : 'تم الإيقاف');
      }
    } catch {
      /* interceptor */
    }
  };
  const featureName = (code: string) => features.find((f) => f.code === code)?.nameAr || code;

  const downloadBackup = async () => {
    const response = await adminApi.get(`/admin/tenants/${id}/backup`);
    const blob = new Blob([JSON.stringify(response.data.data, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tenant-${id}-backup.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('تم تنزيل النسخة الاحتياطية');
  };
  const deleteTenant = async () => {
    if (!window.confirm('تحذير: سيتم حذف كل البيانات نهائياً. نزّل نسخة احتياطية أولاً.')) return;
    const name = window.prompt(`اكتب اسم النشاط للتأكيد: ${tenant.businessName}`);
    if (name !== tenant.businessName) return toast.error('اسم النشاط غير مطابق');
    await adminApi.delete(`/admin/tenants/${id}`, { data: { businessName: name } });
    window.location.href = '/admin/tenants';
  };

  const doResetPassword = async () => {
    if (!resetFor || newPassword.length < 8) {
      toast.error('كلمة المرور لازم 8 أحرف على الأقل');
      return;
    }
    await adminApi.post(`/admin/tenants/${id}/reset-user-password`, {
      userId: resetFor,
      newPassword,
    });
    toast.success('تم تغيير كلمة المرور');
    setResetFor(null);
    setNewPassword('');
  };

  if (!tenant) return <p className="text-gray-400">جاري التحميل...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{tenant.businessName}</h1>
        <p className="text-gray-500 text-sm">Tenant ID: {tenant.id}</p>
        <div className="flex gap-2 mt-3">
          <Button variant="outline" onClick={downloadBackup}>
            تنزيل نسخة احتياطية JSON
          </Button>
          <Button variant="destructive" onClick={deleteTenant}>
            حذف التاجر نهائياً
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold">هوية التاجر البصرية</h2>
          <p className="text-sm text-gray-500">
            هذه الإعدادات تظهر في لوحة التاجر، ولا يمكن للتاجر تعديلها.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label>اسم النظام / المتجر</Label>
            <Input
              value={branding.appName || ''}
              onChange={(e) => setBranding({ ...branding, appName: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>رابط اللوجو</Label>
            <Input
              placeholder="https://.../logo.png"
              value={branding.logoUrl || ''}
              onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
            />
          </div>
          <div>
            <Label>اللون الأساسي</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                className="w-12 p-1"
                value={branding.primaryColor || '#0858A2'}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
              />
              <Input
                value={branding.primaryColor || ''}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>اللون الثانوي</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                className="w-12 p-1"
                value={branding.secondaryColor || '#64748B'}
                onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
              />
              <Input
                value={branding.secondaryColor || ''}
                onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>لون القائمة الجانبية</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                className="w-12 p-1"
                value={branding.sidebarColor || '#1E293B'}
                onChange={(e) => setBranding({ ...branding, sidebarColor: e.target.value })}
              />
              <Input
                value={branding.sidebarColor || ''}
                onChange={(e) => setBranding({ ...branding, sidebarColor: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>لون الشريط العلوي</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                className="w-12 p-1"
                value={branding.headerColor || '#FFFFFF'}
                onChange={(e) => setBranding({ ...branding, headerColor: e.target.value })}
              />
              <Input
                value={branding.headerColor || ''}
                onChange={(e) => setBranding({ ...branding, headerColor: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>نص الفوتر (حقوق النشر)</Label>
            <Input
              value={branding.footerText || ''}
              onChange={(e) => setBranding({ ...branding, footerText: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>رابط الفوتر (اختياري)</Label>
            <Input
              placeholder="https://..."
              value={branding.footerLinkUrl || ''}
              onChange={(e) => setBranding({ ...branding, footerLinkUrl: e.target.value })}
            />
          </div>
        </div>
        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt="معاينة اللوجو"
            className="h-16 max-w-48 object-contain border rounded p-2"
          />
        )}
        <Button onClick={saveBranding} disabled={brandingSaving}>
          {brandingSaving ? 'جاري الحفظ...' : 'حفظ الهوية البصرية'}
        </Button>
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

      <div className="bg-white rounded-lg shadow p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold">الاستخدام والحدود</h2>
          <p className="text-sm text-gray-500">
            الحدود بتتفرض من السيرفر: التاجر مش هيقدر يضيف مستخدمين/فروع/مخازن فوق الحد. سيبها فاضية
            = بدون حد.
          </p>
        </div>
        {usage && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            {[
              [
                'المستخدمين النشطين',
                `${usage.usage.activeUsers}${usage.limits.maxUsers ? ` / ${usage.limits.maxUsers}` : ''}`,
              ],
              ['كل المستخدمين', usage.usage.users],
              [
                'الفروع',
                `${usage.usage.branches}${usage.limits.maxBranches ? ` / ${usage.limits.maxBranches}` : ''}`,
              ],
              [
                'المخازن',
                `${usage.usage.warehouses}${usage.limits.maxWarehouses ? ` / ${usage.limits.maxWarehouses}` : ''}`,
              ],
              [
                'المنتجات',
                `${usage.usage.products}${usage.limits.maxProducts ? ` / ${usage.limits.maxProducts}` : ''}`,
              ],
              ['مفاتيح API نشطة', usage.usage.activeApiKeys],
              ['دخول فاشل (24 ساعة)', usage.usage.failedLogins24h],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className={`rounded-lg p-3 ${label === 'دخول فاشل (24 ساعة)' && Number(value) >= 10 ? 'bg-red-50 text-red-800' : 'bg-gray-50'}`}
              >
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-xl font-bold">{value}</div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>أقصى عدد مستخدمين</Label>
            <Input
              type="number"
              min={1}
              placeholder="بدون حد"
              value={limitsForm.maxUsers}
              onChange={(e) => setLimitsForm({ ...limitsForm, maxUsers: e.target.value })}
            />
          </div>
          <div>
            <Label>أقصى عدد فروع</Label>
            <Input
              type="number"
              min={1}
              placeholder="بدون حد"
              value={limitsForm.maxBranches}
              onChange={(e) => setLimitsForm({ ...limitsForm, maxBranches: e.target.value })}
            />
          </div>
          <div>
            <Label>أقصى عدد مخازن</Label>
            <Input
              type="number"
              min={1}
              placeholder="بدون حد"
              value={limitsForm.maxWarehouses}
              onChange={(e) => setLimitsForm({ ...limitsForm, maxWarehouses: e.target.value })}
            />
          </div>
          <div>
            <Label>أقصى عدد منتجات</Label>
            <Input
              type="number"
              min={1}
              placeholder="بدون حد"
              value={limitsForm.maxProducts}
              onChange={(e) => setLimitsForm({ ...limitsForm, maxProducts: e.target.value })}
            />
          </div>
        </div>
        <Button onClick={saveLimits} disabled={limitsSaving}>
          {limitsSaving ? 'جاري الحفظ...' : 'حفظ الحدود'}
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold">الإعدادات الإقليمية</h2>
          <p className="text-sm text-gray-500">
            المنطقة الزمنية بتأثر على تقارير أوقات الذروة وبداية ونهاية اليوم، والعملة بتظهر في
            الفواتير.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>المنطقة الزمنية</Label>
            <select
              className="h-10 w-full rounded-md border px-3"
              value={regional.timezone}
              onChange={(e) => setRegional({ ...regional, timezone: e.target.value })}
            >
              {!TIMEZONES.some(([v]) => v === regional.timezone) && (
                <option value={regional.timezone}>{regional.timezone}</option>
              )}
              {TIMEZONES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l} — {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>العملة</Label>
            <select
              className="h-10 w-full rounded-md border px-3"
              value={regional.currency}
              onChange={(e) => setRegional({ ...regional, currency: e.target.value })}
            >
              {!CURRENCIES.some(([v]) => v === regional.currency) && (
                <option value={regional.currency}>{regional.currency}</option>
              )}
              {CURRENCIES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l} ({v})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>الدولة</Label>
            <Input
              value={regional.country}
              onChange={(e) => setRegional({ ...regional, country: e.target.value })}
            />
          </div>
        </div>
        <Button onClick={saveRegional} disabled={regionalSaving}>
          {regionalSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات الإقليمية'}
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold">البيع للتاجر</h2>
          <p className="text-sm text-gray-500">
            حدد بنفسك المبلغ اللي بيعته للتاجر (شهري أو سنوي)، واكتب ملحوظة توضح المبلغ ده بتاع إيه.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label>المبلغ</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="مثال: 500"
              value={subscriptionAmount}
              onChange={(e) => setSubscriptionAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>الدورة</Label>
            <select
              className="border rounded-md h-10 px-3 w-full"
              value={subscriptionCycle}
              onChange={(e) => setSubscriptionCycle(e.target.value)}
            >
              <option value="monthly">شهري</option>
              <option value="yearly">سنوي</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <Label>ملحوظات (المبلغ ده بتاع إيه)</Label>
            <Input
              placeholder="مثال: اشتراك شهري + ميزة الفوترة الإلكترونية"
              value={subscriptionNote}
              onChange={(e) => setSubscriptionNote(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={saveSale} disabled={subscriptionSaving}>
          {subscriptionSaving ? 'جاري الحفظ...' : 'حفظ البيع للتاجر'}
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">الميزات المفعّلة</h2>
        <div className="bg-white rounded-lg shadow p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((f) => (
            <label
              key={f.id}
              title={f.descriptionAr || f.code}
              className={`flex items-start gap-2 p-2 rounded border text-sm ${f.isCore ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50'} ${f.isEnabled && !f.isEffective ? 'border-amber-300 bg-amber-50' : ''}`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={f.isEnabled}
                disabled={f.isCore}
                onChange={(e) => toggleFeature(f.id, e.target.checked)}
              />
              <span className="flex-1">
                <span className="font-medium">{f.nameAr}</span>
                {f.isCore && <span className="ms-1 text-xs text-gray-500">(أساسية دايماً)</span>}
                {f.requiresPlan && <span className="ms-1 text-xs text-orange-500">(مدفوعة)</span>}
                {f.dependsOn?.length > 0 && (
                  <span className="block text-xs text-gray-400">
                    تحتاج: {f.dependsOn.map(featureName).join('، ')}
                  </span>
                )}
                {f.isEnabled && !f.isEffective && (
                  <span className="block text-xs text-amber-700">
                    مفعّلة لكن مش شغالة (متطلب مقفول أو انتهت صلاحيتها)
                  </span>
                )}
                {f.expiresAt && (
                  <span className="block text-xs text-gray-400">
                    تنتهي: {new Date(f.expiresAt).toLocaleDateString('ar-EG')}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">مستخدمو هذا التاجر</h2>
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right p-3">الاسم</th>
                <th className="text-right p-3">البريد</th>
                <th className="text-right p-3">آخر دخول</th>
                <th className="text-right p-3">الحالة</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.fullName}</td>
                  <td className="p-3 text-gray-500">{u.email}</td>
                  <td className="p-3 text-gray-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar') : '-'}
                  </td>
                  <td className="p-3">
                    {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                        مقفل مؤقتاً
                      </span>
                    ) : u.isActive ? (
                      <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        نشط
                      </span>
                    ) : (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">موقوف</span>
                    )}
                  </td>
                  <td className="p-3">
                    {resetFor === u.id ? (
                      <div className="flex gap-2">
                        <Input
                          className="h-8 w-40"
                          type="password"
                          autoComplete="new-password"
                          placeholder="كلمة مرور جديدة"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <Button size="sm" onClick={doResetPassword}>
                          حفظ
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setResetFor(null)}>
                          إلغاء
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setResetFor(u.id)}>
                        تغيير كلمة المرور
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">سجل الأمان والنشاط</h2>
          <div className="flex gap-2">
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={auditFilter}
              onChange={(e) => {
                setAuditFilter(e.target.value);
                loadAudit(e.target.value);
              }}
            >
              <option value="">كل الأحداث</option>
              {[
                'TENANT_LOGIN',
                'TENANT_LOGIN_FAILED',
                'TENANT_ACCOUNT_LOCKED',
                'USER_CREATED',
                'USER_ROLES_CHANGED',
                'USER_DELETED',
                'ROLE_UPDATED',
                'API_KEY_CREATED',
                'DATA_EXPORTED',
                'DATA_IMPORTED',
                'PASSWORD_CHANGED',
              ].map((a) => (
                <option key={a} value={a}>
                  {auditLabel(a)}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => loadAudit()}>
              تحديث
            </Button>
          </div>
        </div>
        <div className="max-h-[480px] overflow-auto rounded-lg bg-white shadow">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="p-3 text-right">الوقت</th>
                <th className="p-3 text-right">الحدث</th>
                <th className="p-3 text-right">المستخدم</th>
                <th className="p-3 text-right">IP</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="whitespace-nowrap p-3 text-xs text-gray-500">
                    {formatDateTime(l.createdAt)}
                  </td>
                  <td className="p-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${severityClass(l.severity)}`}>
                      {auditLabel(l.action)}
                    </span>
                  </td>
                  <td className="p-3 text-xs" dir="ltr">
                    {l.userEmail || '—'}
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {l.ip || '—'}
                  </td>
                </tr>
              ))}
              {!auditLogs.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-400">
                    لا يوجد نشاط مسجل
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
