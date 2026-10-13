import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Section, selectClass } from '../ui';

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

const COLORS: Array<[string, string, string]> = [
  ['primaryColor', 'اللون الأساسي', '#0858A2'],
  ['secondaryColor', 'اللون الثانوي', '#64748B'],
  ['sidebarColor', 'لون القائمة الجانبية', '#1E293B'],
  ['headerColor', 'لون الشريط العلوي', '#FFFFFF'],
];

export function SettingsTab({
  id,
  tenant,
  onSaved,
}: {
  id: string;
  tenant: any;
  onSaved: () => void;
}) {
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
  const [regional, setRegional] = useState({
    timezone: tenant.timezone || 'Africa/Cairo',
    currency: tenant.currency || 'EGP',
    country: tenant.country || '',
  });
  const [regionalSaving, setRegionalSaving] = useState(false);

  useEffect(() => {
    adminApi
      .get(`/admin/tenants/${id}/branding`)
      .then((b) => setBranding((c: any) => ({ ...c, ...b.data.data })));
  }, [id]);

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
      onSaved();
    } finally {
      setRegionalSaving(false);
    }
  };

  const deleteTenant = async () => {
    if (!window.confirm('تحذير: هيتم حذف كل بيانات التاجر نهائياً. نزّل نسخة احتياطية الأول.'))
      return;
    const name = window.prompt(`اكتب اسم النشاط للتأكيد: ${tenant.businessName}`);
    if (name !== tenant.businessName) {
      toast.error('اسم النشاط غير مطابق');
      return;
    }
    await adminApi.delete(`/admin/tenants/${id}`, { data: { businessName: name } });
    window.location.href = '/admin/tenants';
  };

  return (
    <div className="space-y-6">
      <Section
        title="الإعدادات الإقليمية"
        description="المنطقة الزمنية بتأثر على التقارير وبداية ونهاية اليوم، والعملة بتظهر في الفواتير."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>المنطقة الزمنية</Label>
            <select
              className={selectClass}
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
              className={selectClass}
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
        <Button className="mt-4" onClick={saveRegional} disabled={regionalSaving}>
          {regionalSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات الإقليمية'}
        </Button>
      </Section>

      <Section
        title="هوية التاجر البصرية"
        description="بتظهر في لوحة التاجر، والتاجر مش بيقدر يعدّلها."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>اسم النظام / المتجر</Label>
            <Input
              value={branding.appName || ''}
              onChange={(e) => setBranding({ ...branding, appName: e.target.value })}
            />
          </div>
          <div className="lg:col-span-2">
            <Label>رابط اللوجو</Label>
            <Input
              placeholder="https://.../logo.png"
              dir="ltr"
              value={branding.logoUrl || ''}
              onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
            />
          </div>
          {COLORS.map(([key, label, fallback]) => (
            <div key={key}>
              <Label>{label}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  className="w-12 p-1"
                  value={branding[key] || fallback}
                  onChange={(e) => setBranding({ ...branding, [key]: e.target.value })}
                />
                <Input
                  dir="ltr"
                  value={branding[key] || ''}
                  onChange={(e) => setBranding({ ...branding, [key]: e.target.value })}
                />
              </div>
            </div>
          ))}
          <div>
            <Label>نص الفوتر</Label>
            <Input
              value={branding.footerText || ''}
              onChange={(e) => setBranding({ ...branding, footerText: e.target.value })}
            />
          </div>
          <div className="lg:col-span-2">
            <Label>رابط الفوتر (اختياري)</Label>
            <Input
              placeholder="https://..."
              dir="ltr"
              value={branding.footerLinkUrl || ''}
              onChange={(e) => setBranding({ ...branding, footerLinkUrl: e.target.value })}
            />
          </div>
        </div>
        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt="معاينة اللوجو"
            className="mt-4 h-16 max-w-48 rounded border object-contain p-2"
          />
        )}
        <Button className="mt-4" onClick={saveBranding} disabled={brandingSaving}>
          {brandingSaving ? 'جاري الحفظ...' : 'حفظ الهوية البصرية'}
        </Button>
      </Section>

      <Section
        title={<span className="text-rose-700">منطقة الخطر</span>}
        className="border-rose-200"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            حذف التاجر بيمسح كل بياناته نهائياً ومينفعش يرجع غير من نسخة احتياطية.
          </p>
          <Button variant="destructive" onClick={deleteTenant}>
            <Trash2 className="ml-1 h-4 w-4" /> حذف التاجر نهائياً
          </Button>
        </div>
      </Section>
    </div>
  );
}
