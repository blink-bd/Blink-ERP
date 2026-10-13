import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Box,
  CalendarDays,
  GitBranch,
  KeyRound,
  LogIn,
  Mail,
  MessageCircle,
  Paperclip,
  ShieldAlert,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  Warehouse,
} from 'lucide-react';
import {
  Badge,
  Section,
  StatCard,
  UsageBar,
  fmtBytes,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  timeAgo,
} from '../ui';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-left font-medium text-slate-800" dir="auto">
        {value ?? '—'}
      </span>
    </div>
  );
}

export function OverviewTab({
  profile,
  onNavigate,
}: {
  profile: any;
  onNavigate: (tab: string) => void;
}) {
  const { usage, activity, security, subscription, owner, contacts, tenant, features } = profile;
  const daily = activity.daily.map((d: any) => ({
    ...d,
    label: d.day.slice(8, 10) + '/' + d.day.slice(5, 7),
  }));
  const docs = activity.documents;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="آخر دخول"
          value={timeAgo(activity.lastLoginAt)}
          hint={activity.lastLoginAt ? fmtDateTime(activity.lastLoginAt) : 'محدش دخل لحد دلوقتي'}
          icon={<LogIn className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="أيام استخدام آخر 30 يوم"
          value={`${activity.activeDays30d} / 30`}
          hint={`${fmtNumber(activity.logins30d)} مرة دخول`}
          icon={<CalendarDays className="h-5 w-5" />}
          tone={
            activity.activeDays30d >= 15 ? 'green' : activity.activeDays30d >= 5 ? 'amber' : 'red'
          }
        />
        <StatCard
          label="فواتير بيع آخر 30 يوم"
          value={fmtNumber(docs.sales30d)}
          hint={`${fmtNumber(docs.sales)} إجمالي · آخر فاتورة ${timeAgo(activity.lastSaleAt)}`}
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="violet"
        />
        <StatCard
          label="أمان (24 ساعة)"
          value={security.failedLogins24h}
          hint={`محاولة فاشلة · ${security.lockedUsers} مستخدم مقفول`}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone={
            security.failedLogins24h >= 10
              ? 'red'
              : security.failedLogins24h > 0
                ? 'amber'
                : 'green'
          }
          onClick={() => onNavigate('activity')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section
          title="نشاط آخر 14 يوم"
          description="عدد العمليات في اليوم (من غير مبالغ)"
          className="lg:col-span-2"
        >
          <div className="h-60" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name="مبيعات" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" name="مشتريات" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="logins" name="دخول" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="بيانات التاجر">
          <div className="divide-y divide-slate-100">
            <Row label="صاحب النشاط" value={owner?.fullName} />
            <Row label="إيميل الدخول" value={owner?.email} />
            <Row label="تليفون" value={tenant.phone || owner?.phone} />
            <Row
              label="المدينة / الدولة"
              value={[tenant.city, tenant.country].filter(Boolean).join(' / ')}
            />
            <Row label="العملة والتوقيت" value={`${tenant.currency} · ${tenant.timezone}`} />
            <Row
              label="عميل من"
              value={`${fmtDate(tenant.createdAt)} (${fmtNumber(subscription.customerForDays)} يوم)`}
            />
            <Row label="أول فاتورة بيع" value={fmtDate(activity.firstSaleAt)} />
          </div>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section
          title="الاشتراك"
          actions={
            <button
              onClick={() => onNavigate('subscription')}
              className="text-xs text-sky-600 hover:underline"
            >
              تعديل
            </button>
          }
        >
          <div className="divide-y divide-slate-100">
            <Row label="الخطة" value={subscription.planName || 'بدون خطة'} />
            <Row
              label="المبلغ"
              value={
                subscription.amount !== null
                  ? `${fmtMoney(subscription.amount)} / ${subscription.cycle === 'yearly' ? 'سنة' : 'شهر'}`
                  : 'مش متسجل'
              }
            />
            <Row label="بداية الاشتراك" value={fmtDate(subscription.startDate)} />
            <Row label="نهاية الاشتراك" value={fmtDate(subscription.endDate)} />
            {subscription.note && <Row label="ملحوظة" value={subscription.note} />}
          </div>
        </Section>

        <Section
          title="تنبيهات التاجر"
          description="الأرقام اللي التاجر حطها لاستقبال تنبيهات حسابه"
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <span className="flex items-center gap-2 text-slate-600">
                <MessageCircle className="h-4 w-4" /> واتساب
              </span>
              <span dir="ltr" className="font-medium">
                {contacts.alertWhatsapp || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <span className="flex items-center gap-2 text-slate-600">
                <Mail className="h-4 w-4" /> إيميل
              </span>
              <span dir="ltr" className="truncate font-medium">
                {contacts.alertEmail || '—'}
              </span>
            </div>
            {!contacts.alertsConfigured && (
              <p className="text-xs text-amber-700">
                التاجر ما حطش وسيلة تواصل للتنبيهات من الإعدادات.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="الصفحات والزراير"
          actions={
            <button
              onClick={() => onNavigate('features')}
              className="text-xs text-sky-600 hover:underline"
            >
              إدارة
            </button>
          }
        >
          <div className="space-y-3 text-sm">
            <div>
              <div className="flex justify-between">
                <span className="text-slate-500">صفحات مفعّلة</span>
                <b>
                  {features.pagesEnabled} / {features.pagesTotal}
                </b>
              </div>
              <UsageBar used={features.pagesEnabled} limit={features.pagesTotal} />
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">زراير مقفولة</span>
              {features.actionsDisabled ? (
                <Badge tone="amber">{features.actionsDisabled} زرار</Badge>
              ) : (
                <Badge tone="green">كله مفتوح</Badge>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">مفاتيح API / Webhooks</span>
              <b>
                {usage.apiKeys} / {usage.webhooks}
              </b>
            </div>
          </div>
        </Section>
      </div>

      <Section title="حجم البيانات والاستخدام">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MiniStat
            icon={<Users className="h-4 w-4" />}
            label="مستخدمين نشطين"
            value={`${usage.activeUsers} / ${usage.users}`}
            limit={usage.limits.maxUsers}
            used={usage.activeUsers}
          />
          <MiniStat
            icon={<GitBranch className="h-4 w-4" />}
            label="فروع"
            value={usage.branches}
            limit={usage.limits.maxBranches}
            used={usage.branches}
          />
          <MiniStat
            icon={<Warehouse className="h-4 w-4" />}
            label="مخازن"
            value={usage.warehouses}
            limit={usage.limits.maxWarehouses}
            used={usage.warehouses}
          />
          <MiniStat
            icon={<Box className="h-4 w-4" />}
            label="أصناف"
            value={fmtNumber(usage.products)}
            limit={usage.limits.maxProducts}
            used={usage.products}
          />
          <MiniStat
            icon={<UserRound className="h-4 w-4" />}
            label="عملاء"
            value={fmtNumber(usage.customers)}
          />
          <MiniStat
            icon={<Truck className="h-4 w-4" />}
            label="موردين"
            value={fmtNumber(usage.suppliers)}
          />
          <MiniStat
            icon={<ShoppingCart className="h-4 w-4" />}
            label="فواتير مشتريات"
            value={`${fmtNumber(docs.purchases)} (${docs.purchases30d} آخر شهر)`}
          />
          <MiniStat
            icon={<ShoppingCart className="h-4 w-4" />}
            label="مرتجعات / مصروفات"
            value={`${fmtNumber(docs.returns)} / ${fmtNumber(docs.expenses)}`}
          />
          <MiniStat
            icon={<KeyRound className="h-4 w-4" />}
            label="صيانة / تحويلات"
            value={`${fmtNumber(docs.maintenance)} / ${fmtNumber(docs.transfers)}`}
          />
          <MiniStat
            icon={<Paperclip className="h-4 w-4" />}
            label="مرفقات"
            value={`${fmtNumber(usage.attachments)} · ${fmtBytes(usage.attachmentsBytes)}`}
          />
        </div>
      </Section>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  used,
  limit,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  used?: number;
  limit?: number | null;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-800">{value}</div>
      {limit ? <UsageBar used={used || 0} limit={limit} /> : null}
    </div>
  );
}
