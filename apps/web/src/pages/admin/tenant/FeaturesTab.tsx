import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Search } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, Skeleton, fmtDate } from '../ui';

interface FeatureRow {
  id: string;
  code: string;
  nameAr: string;
  descriptionAr?: string;
  category: string;
  isCore: boolean;
  requiresPlan: boolean;
  dependsOn: string[];
  parent: string | null;
  kind: 'page' | 'action';
  isEnabled: boolean;
  isEffective: boolean;
  config: Record<string, any>;
  expiresAt?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  core: 'أساسي',
  sales: 'المبيعات',
  purchases: 'المشتريات',
  inventory: 'المخزون',
  accounting: 'الحسابات',
  reports: 'التقارير',
  advanced: 'متقدم',
  tools: 'أدوات',
  integrations: 'الربط',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

function Switch({
  checked,
  disabled,
  onChange,
  size = 'md',
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const dims = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const shift = size === 'sm' ? '-translate-x-4' : '-translate-x-5';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex shrink-0 items-center rounded-full transition ${dims} ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block transform rounded-full bg-white shadow transition ${knob} ${checked ? shift : '-translate-x-0.5'}`}
      />
    </button>
  );
}

export function FeaturesTab({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    const r = await adminApi.get(`/admin/tenants/${id}/features`);
    setFeatures(r.data.data);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [id]);

  const byCode = useMemo(() => new Map(features.map((f) => [f.code, f])), [features]);
  const name = (code: string) => byCode.get(code)?.nameAr || code;

  const apply = async (
    changes: Array<{ featureId: string; isEnabled: boolean }>,
    quiet = false
  ) => {
    if (!changes.length) return;
    setBusy(true);
    try {
      const r = await adminApi.put(`/admin/tenants/${id}/features`, {
        features: changes.map((c) => ({
          ...c,
          config: features.find((f) => f.id === c.featureId)?.config || {},
        })),
      });
      setFeatures(r.data.data);
      if (!quiet) {
        const targets = new Set(
          changes.map((c) => features.find((f) => f.id === c.featureId)?.code)
        );
        const cascaded = (r.data.changes || []).filter((c: any) => !targets.has(c.code));
        if (cascaded.length) {
          const names = cascaded
            .map((c: any) => r.data.data.find((f: any) => f.code === c.code)?.nameAr || c.code)
            .join('، ');
          toast.success(
            changes[0].isEnabled
              ? `تم التفعيل مع المتطلبات: ${names}`
              : `تم الإيقاف مع المعتمد عليها: ${names}`,
            {
              duration: 6000,
            }
          );
        } else {
          toast.success(
            changes.every((c) => c.isEnabled)
              ? 'تم الفتح'
              : changes.every((c) => !c.isEnabled)
                ? 'تم القفل'
                : 'تم الحفظ'
          );
        }
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (feature: FeatureRow, isEnabled: boolean) => {
    if (
      !isEnabled &&
      feature.isCore &&
      !window.confirm(
        `«${feature.nameAr}» صفحة أساسية. قفلها هيخفيها عن التاجر وكل موظفينه، والسيرفر هيرفض طلباتها. متأكد؟`
      )
    ) {
      return;
    }
    return apply([{ featureId: feature.id, isEnabled }]);
  };

  const setConfig = (featureId: string, key: string, value: number) =>
    setFeatures((current) =>
      current.map((f) =>
        f.id === featureId ? { ...f, config: { ...(f.config || {}), [key]: value } } : f
      )
    );

  const saveConfig = async (feature: FeatureRow) => {
    await adminApi.put(`/admin/tenants/${id}/features`, {
      features: [{ featureId: feature.id, isEnabled: feature.isEnabled, config: feature.config }],
    });
    toast.success('تم حفظ إعدادات الميزة');
    load();
  };

  const pages = features.filter((f) => f.kind === 'page');
  const actionsOf = (code: string) => features.filter((f) => f.parent === code);
  const q = query.trim();
  const visiblePages = pages.filter(
    (p) =>
      !q ||
      p.nameAr.includes(q) ||
      p.code.includes(q) ||
      actionsOf(p.code).some((a) => a.nameAr.includes(q))
  );
  const grouped = CATEGORY_ORDER.concat(
    Array.from(new Set(pages.map((p) => p.category))).filter((c) => !CATEGORY_ORDER.includes(c))
  )
    .map((cat) => [cat, visiblePages.filter((p) => p.category === cat)] as const)
    .filter(([, list]) => list.length);

  const totalActions = features.filter((f) => f.kind === 'action');
  const closedActions = totalActions.filter((f) => !f.isEnabled).length;

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        <b>تحكم كامل لكل تاجر:</b> اقفل أي صفحة كاملة، أو افتح الصفحة واقفل زراير معيّنة جواها (زي
        الخصم، البيع الآجل، الحذف، مشاركة الفاتورة…). القفل بيتطبق على السيرفر نفسه، مش بس بيختفي من
        الشاشة — وبيوصل للتاجر خلال ثواني من غير ما يعمل خروج.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pr-9"
            placeholder="ابحث عن صفحة أو زرار"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>
            {pages.filter((p) => p.isEffective).length} / {pages.length} صفحة شغالة
          </span>
          <span>·</span>
          <span>{closedActions ? `${closedActions} زرار مقفول` : 'كل الزراير مفتوحة'}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(new Set(pages.map((p) => p.code)))}
          >
            فتح الكل
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
            طي الكل
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || pages.every((p) => p.isEnabled)}
            onClick={() =>
              apply(
                pages.filter((p) => !p.isEnabled).map((p) => ({ featureId: p.id, isEnabled: true }))
              )
            }
          >
            فتح كل الصفحات
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-rose-600"
            disabled={busy || pages.every((p) => !p.isEnabled)}
            onClick={() => {
              if (
                !window.confirm(
                  'هيتقفل على التاجر كل الصفحات (حتى لوحة التحكم والإعدادات والمستخدمين). متأكد؟'
                )
              )
                return;
              apply(
                pages.filter((p) => p.isEnabled).map((p) => ({ featureId: p.id, isEnabled: false }))
              );
            }}
          >
            قفل كل الصفحات
          </Button>
        </div>
      </div>

      {grouped.map(([cat, list]) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {CATEGORY_LABELS[cat] || cat}
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((page) => {
              const actions = actionsOf(page.code);
              const open =
                expanded.has(page.code) ||
                (q.length > 0 && actions.some((a) => a.nameAr.includes(q)));
              const closed = actions.filter((a) => !a.isEnabled).length;
              const pageOn = page.isEffective;
              return (
                <div
                  key={page.id}
                  className={`rounded-xl border bg-white shadow-sm transition ${pageOn ? 'border-slate-200' : 'border-slate-200 bg-slate-50/70'}`}
                >
                  <div
                    className={`flex items-start gap-3 p-4 ${actions.length ? 'cursor-pointer' : ''}`}
                    onClick={() =>
                      actions.length &&
                      setExpanded((s) => {
                        const next = new Set(s);
                        if (next.has(page.code)) next.delete(page.code);
                        else next.add(page.code);
                        return next;
                      })
                    }
                  >
                    <Switch
                      checked={page.isEnabled}
                      disabled={busy}
                      onChange={(v) => toggle(page, v)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`font-semibold ${pageOn ? 'text-slate-900' : 'text-slate-500'}`}
                        >
                          {page.nameAr}
                        </span>
                        {page.isCore && <Badge tone="blue">أساسية</Badge>}
                        {page.requiresPlan && <Badge tone="violet">مدفوعة</Badge>}
                        {page.isEnabled && !page.isEffective && (
                          <Badge tone="amber">مفعّلة بس متطلب مقفول</Badge>
                        )}
                        {closed > 0 && pageOn && <Badge tone="amber">{closed} زرار مقفول</Badge>}
                      </div>
                      {page.descriptionAr && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                          {page.descriptionAr}
                        </p>
                      )}
                      {page.dependsOn?.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          تحتاج: {page.dependsOn.map(name).join('، ')}
                        </p>
                      )}
                      {page.expiresAt && (
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          تنتهي: {fmtDate(page.expiresAt)}
                        </p>
                      )}
                    </div>
                    {actions.length > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                        {actions.length} زرار
                        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
                      </span>
                    )}
                  </div>

                  {page.code === 'balance_reminders' && page.isEnabled && (
                    <div className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-3 sm:items-end">
                      <div>
                        <Label>تنبيه العميل كل (يوم)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={3650}
                          value={page.config?.customerReminderDays ?? 30}
                          onChange={(e) =>
                            setConfig(page.id, 'customerReminderDays', Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        <Label>تنبيه المورد كل (يوم)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={3650}
                          value={page.config?.supplierReminderDays ?? 30}
                          onChange={(e) =>
                            setConfig(page.id, 'supplierReminderDays', Number(e.target.value))
                          }
                        />
                      </div>
                      <Button size="sm" variant="outline" onClick={() => saveConfig(page)}>
                        حفظ المدد
                      </Button>
                    </div>
                  )}
                  {page.code === 'supplier_balance_limit' && page.isEnabled && (
                    <div className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-3 sm:items-end">
                      <div className="sm:col-span-2">
                        <Label>حد إجمالي مستحقات الموردين</Label>
                        <Input
                          type="number"
                          min={1}
                          step="0.01"
                          placeholder="مثال: 50000"
                          value={page.config?.limitAmount ?? ''}
                          onChange={(e) =>
                            setConfig(page.id, 'limitAmount', Number(e.target.value))
                          }
                        />
                      </div>
                      <Button size="sm" variant="outline" onClick={() => saveConfig(page)}>
                        حفظ الحد
                      </Button>
                    </div>
                  )}

                  {open && actions.length > 0 && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">
                          الزراير جوه «{page.nameAr}»
                        </span>
                        <span className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={busy || !pageOn}
                            onClick={() =>
                              apply(
                                actions
                                  .filter((a) => !a.isEnabled)
                                  .map((a) => ({ featureId: a.id, isEnabled: true }))
                              )
                            }
                          >
                            افتح الكل
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-rose-600"
                            disabled={busy || !pageOn}
                            onClick={() =>
                              apply(
                                actions
                                  .filter((a) => a.isEnabled)
                                  .map((a) => ({ featureId: a.id, isEnabled: false }))
                              )
                            }
                          >
                            اقفل الكل
                          </Button>
                        </span>
                      </div>
                      {!pageOn && (
                        <p className="mb-2 text-xs text-amber-700">
                          الصفحة نفسها مقفولة، فكل زرايرها مقفولة تلقائياً.
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {actions.map((action) => {
                          const extraDeps = action.dependsOn.filter((d) => d !== page.code);
                          return (
                            <label
                              key={action.id}
                              className={`flex items-start gap-3 rounded-lg bg-white px-3 py-2 ${!pageOn ? 'opacity-60' : ''}`}
                            >
                              <Switch
                                size="sm"
                                checked={action.isEnabled}
                                disabled={busy || !pageOn}
                                onChange={(v) => toggle(action, v)}
                              />
                              <span className="min-w-0 flex-1 text-sm">
                                <span
                                  className={
                                    action.isEffective
                                      ? 'text-slate-800'
                                      : 'text-slate-400 line-through decoration-slate-300'
                                  }
                                >
                                  {action.nameAr}
                                </span>
                                {action.descriptionAr && (
                                  <span className="block text-[11px] text-slate-400">
                                    {action.descriptionAr}
                                  </span>
                                )}
                                {extraDeps.length > 0 && (
                                  <span className="block text-[11px] text-slate-400">
                                    يحتاج كمان: {extraDeps.map(name).join('، ')}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
