import { useEffect, useState } from 'react';
import { Signed } from '@/lib/signed';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Mail,
  MessageCircle,
  ShieldAlert,
  Store,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { auditLabel } from '@/lib/audit-labels';
import {
  Badge,
  EmptyState,
  Section,
  Skeleton,
  StatCard,
  daysLeftLabel,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  timeAgo,
} from './ui';

const MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    adminApi.get('/admin/dashboard').then((r) => setData(r.data.data));
    adminApi.get('/admin/audit-logs', { params: { limit: 12 } }).then((r) => setLogs(r.data.data));
  }, []);

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  const t = data.tenants;
  const u = data.users;
  const growth = data.growth.map((g: any) => ({
    ...g,
    label: MONTHS[Number(g.month.slice(5, 7)) - 1],
  }));
  const goTenants = (filter: string) => navigate(`/admin/tenants?filter=${filter}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">نظرة عامة</h1>
          <p className="text-sm text-slate-500">صحة المنصة والاشتراكات ونشاط التجار</p>
        </div>
        <Link to="/admin/tenants" className="text-sm font-medium text-sky-600 hover:underline">
          كل التجار ←
        </Link>
      </div>

      {(!data.channels.email || !data.channels.whatsapp) && (
        <Link
          to="/admin/channels"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 hover:bg-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <b>تنبيهات التجار مش هتوصل بالكامل:</b> {!data.channels.email && 'الإيميل مش متظبط. '}
            {!data.channels.whatsapp && 'واتساب مش متظبط. '}
            اضغط هنا عشان تظبط قنوات الإرسال.
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="إجمالي التجار"
          value={fmtNumber(t.total)}
          signedValue={t.total}
          icon={<Store className="h-5 w-5" />}
          hint={`${fmtNumber(t.new30d)} جديد آخر 30 يوم`}
          onClick={() => goTenants('all')}
        />
        <StatCard
          label="نشطين"
          value={fmtNumber(t.active)}
          tone="green"
          signedValue={t.active}
          icon={<CheckCircle2 className="h-5 w-5" />}
          onClick={() => goTenants('active')}
        />
        <StatCard
          label="ينتهي اشتراكهم خلال 7 أيام"
          value={fmtNumber(t.expiring7d)}
          tone="amber"
          icon={<CalendarClock className="h-5 w-5" />}
          hint={`${fmtNumber(t.expiring30d)} خلال 30 يوم`}
          onClick={() => goTenants('expiring')}
        />
        <StatCard
          label="منتهي / موقوف"
          value={`${fmtNumber(t.expired)} / ${fmtNumber(t.suspended)}`}
          tone="red"
          icon={<XCircle className="h-5 w-5" />}
          onClick={() => goTenants('expired')}
        />
        <StatCard
          label="الدخل الشهري المتوقع"
          value={fmtMoney(data.revenue.monthlyRecurring)}
          tone="violet"
          signedValue={data.revenue.monthlyRecurring}
          icon={<CircleDollarSign className="h-5 w-5" />}
          hint={`سنوي ≈ ${fmtMoney(data.revenue.yearlyRunRate)}${data.revenue.withoutAmount ? ` · ${data.revenue.withoutAmount} تاجر من غير مبلغ` : ''}`}
        />
        <StatCard
          label="تجديدات مستحقة (30 يوم)"
          value={fmtMoney(data.revenue.renewalsValue30d)}
          tone="blue"
          signedValue={data.revenue.renewalsValue30d}
          icon={<CalendarClock className="h-5 w-5" />}
        />
        <StatCard
          label="المستخدمين"
          value={fmtNumber(u.total)}
          signedValue={u.total}
          icon={<Users className="h-5 w-5" />}
          hint={`${fmtNumber(u.activeToday)} النهارده · ${fmtNumber(u.active7d)} آخر 7 أيام`}
        />
        <StatCard
          label="تجار مش بيستخدموا السيستم"
          value={fmtNumber(data.inactive.count)}
          tone={data.inactive.count ? 'amber' : 'green'}
          icon={<Activity className="h-5 w-5" />}
          hint={`مفيش دخول من 14 يوم+ · ${fmtNumber(data.inactive.neverLoggedIn)} عمرهم ما دخلوا`}
          onClick={() => goTenants('inactive')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section
          title="التجديدات القريبة"
          description="اشتراكات بتنتهي خلال 30 يوم أو انتهت من قريب"
          className="lg:col-span-2"
        >
          {data.renewals.length === 0 ? (
            <EmptyState>مفيش اشتراكات قربت تخلص 🎉</EmptyState>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.renewals.map((r: any) => (
                <Link
                  key={r.id}
                  to={`/admin/tenants/${r.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{r.businessName}</div>
                    <div className="text-xs text-slate-400">ينتهي {fmtDate(r.endDate)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.amount !== null && (
                      <span className="text-xs text-slate-500">
                        <Signed value={r.amount}>{fmtMoney(r.amount)}</Signed> /{' '}
                        {r.cycle === 'yearly' ? 'سنة' : 'شهر'}
                      </span>
                    )}
                    <Badge tone={r.daysLeft < 0 ? 'red' : r.daysLeft <= 7 ? 'amber' : 'blue'}>
                      {daysLeftLabel(r.daysLeft)}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="قنوات الإرسال"
          actions={
            <Link to="/admin/channels" className="text-xs text-sky-600 hover:underline">
              إعداد
            </Link>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <span className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-slate-500" /> الإيميل
              </span>
              {data.channels.email ? (
                <Badge tone="green">شغال · {data.channels.emailProvider}</Badge>
              ) : (
                <Badge tone="red">مش متظبط</Badge>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <span className="flex items-center gap-2 text-sm">
                <MessageCircle className="h-4 w-4 text-slate-500" /> واتساب
              </span>
              {data.channels.whatsapp ? (
                <Badge tone="green">شغال</Badge>
              ) : (
                <Badge tone="red">مش متظبط</Badge>
              )}
            </div>
            <p className="text-xs text-slate-400">
              من غيرهم تنبيهات المديونيات والموردين وانتهاء الاشتراك مش هتوصل للتجار.
            </p>
          </div>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="تجار محتاجين متابعة" description="مفيش دخول من 14 يوم أو أكتر">
          {data.inactive.items.length === 0 ? (
            <EmptyState>كل التجار بيستخدموا السيستم</EmptyState>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.inactive.items.map((r: any) => (
                <Link
                  key={r.id}
                  to={`/admin/tenants/${r.id}`}
                  className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50"
                >
                  <span className="truncate text-sm font-medium text-slate-800">
                    {r.businessName}
                  </span>
                  <span className="shrink-0 text-xs text-amber-700">
                    {r.lastActivityAt ? timeAgo(r.lastActivityAt) : 'عمره ما دخل'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="أمان آخر 24 ساعة"
          description={`${fmtNumber(data.security.failedLogins24h)} محاولة دخول فاشلة`}
        >
          {data.security.tenants.length === 0 ? (
            <EmptyState>مفيش محاولات مريبة</EmptyState>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.security.tenants.map((r: any) => (
                <Link
                  key={r.id}
                  to={`/admin/tenants/${r.id}?tab=activity`}
                  className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50"
                >
                  <span className="truncate text-sm font-medium text-slate-800">
                    {r.businessName}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Badge tone={r.failed >= 15 ? 'red' : 'amber'}>
                      <ShieldAlert className="h-3 w-3" />
                      {r.failed} فاشلة
                    </Badge>
                    {r.locked > 0 && <Badge tone="red">{r.locked} قفل</Badge>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="تجار جدد">
          {data.recent.length === 0 ? (
            <EmptyState>لسه مفيش تجار</EmptyState>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recent.map((r: any) => (
                <Link
                  key={r.id}
                  to={`/admin/tenants/${r.id}`}
                  className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserPlus className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="truncate text-sm font-medium text-slate-800">
                      {r.businessName}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(r.createdAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="نمو التجار" description="تجار جدد في كل شهر (آخر 6 شهور)">
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growth}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => [v, 'تاجر جديد']} />
                <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="انتشار الميزات المدفوعة" description="عدد التجار المفعّل عندهم كل ميزة">
          {data.adoption.length === 0 ? (
            <EmptyState>مفيش ميزات مدفوعة</EmptyState>
          ) : (
            <div className="space-y-2.5">
              {[...data.adoption]
                .sort((a: any, b: any) => b.tenants - a.tenants)
                .map((f: any) => (
                  <div key={f.code}>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-700">{f.nameAr}</span>
                      <span className="text-slate-500">
                        {f.tenants} / {t.total}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{
                          width: `${t.total ? Math.round((f.tenants / t.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="آخر عمليات الإدارة">
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-3 text-right font-medium">الوقت</th>
                <th className="p-3 text-right font-medium">المدير</th>
                <th className="p-3 text-right font-medium">العملية</th>
                <th className="p-3 text-right font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    لا توجد عمليات
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap p-3 text-xs text-slate-500">
                    {fmtDateTime(l.createdAt)}
                  </td>
                  <td className="p-3 text-xs" dir="ltr">
                    {l.adminEmail}
                  </td>
                  <td className="p-3">{auditLabel(l.action)}</td>
                  <td className="p-3 font-mono text-xs text-slate-500" dir="ltr">
                    {l.ip || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
