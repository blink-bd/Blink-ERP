import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, Section, UsageBar, daysLeftLabel, fmtMoney, selectClass } from '../ui';

const limitInput = (v: number | null | undefined) =>
  v === null || v === undefined ? '' : String(v);

const STATUSES: Array<[string, string]> = [
  ['active', 'نشط'],
  ['suspended', 'معلّق'],
  ['expired', 'منتهي'],
  ['cancelled', 'ملغي'],
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function SubscriptionTab({
  id,
  tenant,
  profile,
  onSaved,
}: {
  id: string;
  tenant: any;
  profile: any;
  onSaved: () => void;
}) {
  const [plans, setPlans] = useState<any[]>([]);
  const [endDate, setEndDate] = useState(
    tenant.subscriptionEndDate ? tenant.subscriptionEndDate.slice(0, 10) : ''
  );
  const [amount, setAmount] = useState(
    tenant.subscriptionAmount != null ? String(tenant.subscriptionAmount) : ''
  );
  const [cycle, setCycle] = useState(tenant.subscriptionCycle || 'monthly');
  const [note, setNote] = useState(tenant.subscriptionNote || '');
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<any>(null);
  const [limits, setLimits] = useState({
    maxUsers: '',
    maxBranches: '',
    maxWarehouses: '',
    maxProducts: '',
  });
  const [limitsSaving, setLimitsSaving] = useState(false);

  const loadUsage = async () => {
    const r = await adminApi.get(`/admin/tenants/${id}/usage`);
    setUsage(r.data.data);
    const l = r.data.data.limits;
    setLimits({
      maxUsers: limitInput(l.maxUsers),
      maxBranches: limitInput(l.maxBranches),
      maxWarehouses: limitInput(l.maxWarehouses),
      maxProducts: limitInput(l.maxProducts),
    });
  };
  useEffect(() => {
    adminApi.get('/admin/plans').then((r) => setPlans(r.data.data));
    loadUsage().catch(() => undefined);
  }, [id]);

  const setStatus = async (subscriptionStatus: string) => {
    await adminApi.patch(`/admin/tenants/${id}/status`, { subscriptionStatus });
    toast.success('تم تحديث حالة الاشتراك');
    onSaved();
  };

  const setPlan = async (planId: string) => {
    await adminApi.put(`/admin/tenants/${id}/subscription`, { planId });
    toast.success('تم تغيير الخطة');
    onSaved();
  };

  /** تمديد من تاريخ الانتهاء الحالي (أو من النهارده لو منتهي). */
  const extend = (months: number) => {
    const base = endDate && new Date(endDate) > new Date() ? new Date(endDate) : new Date();
    base.setMonth(base.getMonth() + months);
    setEndDate(isoDay(base));
  };

  const save = async () => {
    if (amount && Number(amount) < 0) {
      toast.error('المبلغ غير صحيح');
      return;
    }
    setSaving(true);
    try {
      await adminApi.put(`/admin/tenants/${id}/subscription`, {
        subscriptionEndDate: endDate || null,
        subscriptionAmount: amount ? Number(amount) : undefined,
        subscriptionCycle: cycle,
        subscriptionNote: note,
      });
      toast.success('تم حفظ الاشتراك');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const saveLimits = async () => {
    const parse = (v: string) => (v.trim() === '' ? null : Math.max(1, Math.floor(Number(v))));
    setLimitsSaving(true);
    try {
      await adminApi.put(`/admin/tenants/${id}/limits`, {
        maxUsers: parse(limits.maxUsers),
        maxBranches: parse(limits.maxBranches),
        maxWarehouses: parse(limits.maxWarehouses),
        maxProducts: parse(limits.maxProducts),
      });
      toast.success('تم تحديث حدود الحساب');
      loadUsage();
    } finally {
      setLimitsSaving(false);
    }
  };

  const sub = profile.subscription;
  const monthly = amount ? (cycle === 'yearly' ? Number(amount) / 12 : Number(amount)) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="حالة الاشتراك" className="lg:col-span-1">
          <div className="space-y-4">
            <div>
              <Label>الحالة</Label>
              <select
                className={selectClass}
                value={tenant.subscriptionStatus}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUSES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="text-slate-500">الوضع الحالي</div>
              <div className="mt-1 font-bold text-slate-800">{daysLeftLabel(sub.daysLeft)}</div>
              {sub.monthlyValue > 0 && (
                <div className="mt-1 text-xs text-slate-500">
                  يعادل {fmtMoney(sub.monthlyValue)} شهرياً
                </div>
              )}
            </div>
            <div>
              <Label>الخطة</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setPlan(plan.id)}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      tenant.planId === plan.id
                        ? 'border-violet-500 bg-violet-50 text-violet-800'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {plan.nameAr}
                    <span className="block text-[11px] text-slate-400">
                      {Number(plan.priceMonthly) ? `${plan.priceMonthly} / شهر` : 'مجاني'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="التجديد والمبلغ"
          description="المبلغ اللي التاجر بيدفعه لك ومدة الاشتراك"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>تاريخ نهاية الاشتراك</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="date"
                  className="w-44"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                {[
                  [1, '+ شهر'],
                  [3, '+ 3 شهور'],
                  [6, '+ 6 شهور'],
                  [12, '+ سنة'],
                ].map(([m, l]) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => extend(Number(m))}
                  >
                    {l}
                  </Button>
                ))}
                {endDate && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEndDate('')}>
                    بدون انتهاء
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>المبلغ</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="مثال: 500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>الدورة</Label>
              <select
                className={selectClass}
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
              >
                <option value="monthly">شهري</option>
                <option value="yearly">سنوي</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label>ملحوظة (المبلغ ده بتاع إيه)</Label>
              <Input
                placeholder="مثال: اشتراك شهري + ميزة الفوترة الإلكترونية"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {monthly > 0 ? `يعادل ${fmtMoney(monthly)} في الشهر` : ''}
            </span>
            <Button onClick={save} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ الاشتراك'}
            </Button>
          </div>
        </Section>
      </div>

      <Section
        title="الاستخدام والحدود"
        description="الحدود بتتفرض من السيرفر: التاجر مش هيقدر يضيف فوق الحد. سيبها فاضية = بدون حد."
      >
        {usage && (
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['المستخدمين النشطين', usage.usage.activeUsers, usage.limits.maxUsers],
              ['الفروع', usage.usage.branches, usage.limits.maxBranches],
              ['المخازن', usage.usage.warehouses, usage.limits.maxWarehouses],
              ['الأصناف', usage.usage.products, usage.limits.maxProducts],
            ].map(([label, used, limit]) => (
              <div key={label as string} className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  {label}
                  {limit && Number(used) >= Number(limit) ? (
                    <Badge tone="red">وصل للحد</Badge>
                  ) : null}
                </div>
                <div className="text-xl font-bold">{used as number}</div>
                <UsageBar used={Number(used)} limit={limit as number | null} />
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['maxUsers', 'أقصى عدد مستخدمين'],
              ['maxBranches', 'أقصى عدد فروع'],
              ['maxWarehouses', 'أقصى عدد مخازن'],
              ['maxProducts', 'أقصى عدد أصناف'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                type="number"
                min={1}
                placeholder="بدون حد"
                value={limits[key]}
                onChange={(e) => setLimits({ ...limits, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <Button className="mt-4" onClick={saveLimits} disabled={limitsSaving}>
          {limitsSaving ? 'جاري الحفظ...' : 'حفظ الحدود'}
        </Button>
      </Section>
    </div>
  );
}
