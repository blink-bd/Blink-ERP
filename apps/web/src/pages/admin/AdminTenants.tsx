import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Plus, Search, Upload, Users, X, GitBranch } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Badge,
  EmptyState,
  HealthFlag,
  HealthFlags,
  Skeleton,
  daysLeftLabel,
  fmtMoney,
  selectClass,
  tenantStatus,
  timeAgo,
} from './ui';

interface TenantRow {
  id: string;
  businessName: string;
  businessNameAr?: string;
  email: string;
  phone?: string;
  city?: string;
  isActive: boolean;
  subscriptionStatus: string;
  subscriptionEndDate?: string | null;
  subscriptionAmount: number | null;
  subscriptionCycle?: string | null;
  planName?: string | null;
  createdAt: string;
  users: number;
  branches: number;
  lastActivityAt?: string | null;
  operations30d: number;
  failedLogins24h: number;
  ownerName?: string | null;
  daysLeft: number | null;
  health: HealthFlag[];
}

const FILTERS: Array<[string, string]> = [
  ['all', 'الكل'],
  ['active', 'نشط'],
  ['expiring', 'ينتهي خلال 30 يوم'],
  ['expired', 'منتهي / موقوف'],
  ['inactive', 'مش بيستخدم السيستم'],
  ['attention', 'محتاج انتباه'],
];

const SORTS: Array<[string, string]> = [
  ['recent', 'الأحدث'],
  ['expiry', 'أقرب انتهاء'],
  ['activity', 'آخر نشاط'],
  ['idle', 'الأقل نشاطاً'],
  ['name', 'الاسم'],
];

const emptyForm = {
  businessName: '',
  businessNameAr: '',
  email: '',
  phone: '',
  adminFullName: '',
  adminEmail: '',
  adminPassword: '',
};

export function AdminTenantsPage() {
  const [params, setParams] = useSearchParams();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState('');
  const filter = params.get('filter') || 'all';
  const [sort, setSort] = useState('recent');

  const load = () => {
    setLoading(true);
    adminApi
      .get('/admin/tenants')
      .then((r) => setTenants(r.data.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const restore = async (file: File) => {
    const data = new FormData();
    data.append('file', file);
    await adminApi.post('/admin/tenants/restore', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    toast.success('تمت استعادة التاجر');
    load();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post('/admin/tenants', {
        businessName: form.businessName,
        businessNameAr: form.businessNameAr || form.businessName,
        email: form.email,
        phone: form.phone || undefined,
        adminUser: {
          fullName: form.adminFullName,
          email: form.adminEmail,
          password: form.adminPassword,
        },
      });
      toast.success('تم إنشاء التاجر');
      setShowForm(false);
      setForm(emptyForm);
      load();
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [key] of FILTERS) c[key] = tenants.filter((t) => matches(t, key)).length;
    return c;
  }, [tenants]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tenants.filter(
      (t) =>
        matches(t, filter) &&
        (!q ||
          [t.businessName, t.businessNameAr, t.email, t.phone, t.ownerName, t.city]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)))
    );
    const time = (v?: string | null) => (v ? new Date(v).getTime() : 0);
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'expiry':
          return (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999);
        case 'activity':
          return time(b.lastActivityAt) - time(a.lastActivityAt);
        case 'idle':
          return time(a.lastActivityAt) - time(b.lastActivityAt);
        case 'name':
          return (a.businessNameAr || a.businessName).localeCompare(
            b.businessNameAr || b.businessName,
            'ar'
          );
        default:
          return time(b.createdAt) - time(a.createdAt);
      }
    });
  }, [tenants, query, filter, sort]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">التجّار</h1>
          <p className="text-sm text-slate-500">
            {tenants.length} تاجر — اضغط على أي تاجر عشان تفتح ملفه الكامل
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            <span>استعادة نسخة JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
            />
          </label>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="ml-2 h-4 w-4" /> : <Plus className="ml-2 h-4 w-4" />}
            {showForm ? 'إلغاء' : 'إضافة تاجر جديد'}
          </Button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2"
        >
          <div>
            <Label>اسم النشاط التجاري</Label>
            <Input
              required
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            />
          </div>
          <div>
            <Label>الاسم بالعربي</Label>
            <Input
              value={form.businessNameAr}
              onChange={(e) => setForm({ ...form, businessNameAr: e.target.value })}
            />
          </div>
          <div>
            <Label>بريد النشاط</Label>
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>الهاتف</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="border-t pt-4 sm:col-span-2">
            <p className="text-sm font-medium text-slate-600">حساب صاحب النشاط (أول مستخدم)</p>
          </div>
          <div>
            <Label>الاسم</Label>
            <Input
              required
              value={form.adminFullName}
              onChange={(e) => setForm({ ...form, adminFullName: e.target.value })}
            />
          </div>
          <div>
            <Label>البريد (للدخول)</Label>
            <Input
              type="email"
              required
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            />
          </div>
          <div>
            <Label>كلمة المرور</Label>
            <Input
              type="text"
              required
              minLength={8}
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              التاجر مش هيقدر يغيرها بنفسه — التغيير من ملفه هنا بس.
            </p>
          </div>
          <div className="flex items-end justify-end sm:col-span-1">
            <Button type="submit" disabled={saving}>
              {saving ? 'جاري الإنشاء...' : 'إنشاء التاجر'}
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setParams(key === 'all' ? {} : { filter: key })}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              filter === key
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {label} <span className="opacity-60">({counts[key] ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pr-9"
            placeholder="ابحث بالاسم أو الإيميل أو التليفون أو اسم صاحب النشاط"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className={`${selectClass} sm:w-48`}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORTS.map(([key, label]) => (
            <option key={key} value={key}>
              ترتيب: {label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState>مفيش تجار مطابقين</EmptyState>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => {
            const status = tenantStatus(t);
            return (
              <Link
                key={t.id}
                to={`/admin/tenants/${t.id}`}
                className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg font-bold text-slate-600">
                      {(t.businessNameAr || t.businessName).trim().charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold text-slate-900">
                          {t.businessNameAr || t.businessName}
                        </span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {t.planName && <Badge tone="violet">{t.planName}</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500" dir="auto">
                        {[t.ownerName, t.email, t.phone, t.city].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-slate-300 transition group-hover:text-sky-500" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
                  <Metric
                    label="الاشتراك"
                    value={daysLeftLabel(t.daysLeft)}
                    warn={t.daysLeft !== null && t.daysLeft <= 7}
                  />
                  <Metric
                    label="المبلغ"
                    value={
                      t.subscriptionAmount
                        ? `${fmtMoney(t.subscriptionAmount)} / ${t.subscriptionCycle === 'yearly' ? 'سنة' : 'شهر'}`
                        : '—'
                    }
                  />
                  <Metric label="آخر دخول" value={timeAgo(t.lastActivityAt)} />
                  <Metric
                    label="المستخدمين والفروع"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-0.5">
                          <Users className="h-3 w-3" />
                          {t.users}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <GitBranch className="h-3 w-3" />
                          {t.branches}
                        </span>
                      </span>
                    }
                  />
                  <Metric label="عمليات بيع آخر 30 يوم" value={t.operations30d} />
                </div>
                {t.health.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <HealthFlags flags={t.health} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`mt-0.5 font-medium ${warn ? 'text-amber-700' : 'text-slate-700'}`}>
        {value}
      </div>
    </div>
  );
}

function matches(t: TenantRow, filter: string) {
  const idleDays = t.lastActivityAt
    ? (Date.now() - new Date(t.lastActivityAt).getTime()) / 86_400_000
    : Infinity;
  const status = tenantStatus(t);
  switch (filter) {
    case 'active':
      return status.label === 'نشط' || status.label === 'ينتهي قريب';
    case 'expiring':
      return t.isActive && t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 30;
    case 'expired':
      return ['منتهي', 'موقوف', 'معلّق', 'ملغي'].includes(status.label);
    case 'inactive':
      return t.isActive && idleDays >= 14;
    case 'attention':
      return t.health.some((f) => f.level !== 'info');
    default:
      return true;
  }
}
