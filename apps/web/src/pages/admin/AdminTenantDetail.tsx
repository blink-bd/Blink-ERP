import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Copy, Download, Power } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Badge, HealthFlags, Skeleton, daysLeftLabel, tenantStatus } from './ui';
import { OverviewTab } from './tenant/OverviewTab';
import { SubscriptionTab } from './tenant/SubscriptionTab';
import { FeaturesTab } from './tenant/FeaturesTab';
import { UsersTab } from './tenant/UsersTab';
import { BranchesTab } from './tenant/BranchesTab';
import { ActivityTab } from './tenant/ActivityTab';
import { SettingsTab } from './tenant/SettingsTab';

const TABS: Array<[string, string]> = [
  ['overview', 'نظرة عامة'],
  ['subscription', 'الاشتراك والحدود'],
  ['features', 'الصفحات والزراير'],
  ['users', 'المستخدمين'],
  ['branches', 'الفروع والمخازن'],
  ['activity', 'سجل النشاط'],
  ['settings', 'الإعدادات'],
];

export function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const [tenant, setTenant] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [failed, setFailed] = useState<{ tenant?: boolean; profile?: boolean }>({});

  // كل طلب لوحده: لو ملخص الملف وقع، باقي الصفحة (المستخدمين، الميزات...) تفضل شغالة.
  const load = async () => {
    const [t, p] = await Promise.allSettled([
      adminApi.get(`/admin/tenants/${id}`),
      adminApi.get(`/admin/tenants/${id}/profile`),
    ]);
    if (t.status === 'fulfilled') setTenant(t.value.data.data);
    if (p.status === 'fulfilled') setProfile(p.value.data.data);
    setFailed({ tenant: t.status === 'rejected', profile: p.status === 'rejected' });
  };
  useEffect(() => {
    setTenant(null);
    setProfile(null);
    setFailed({});
    load();
  }, [id]);

  const toggleActive = async () => {
    if (tenant.isActive && !window.confirm('إيقاف التاجر هيمنع كل مستخدميه من الدخول. متأكد؟'))
      return;
    await adminApi.patch(`/admin/tenants/${id}/status`, { isActive: !tenant.isActive });
    toast.success(tenant.isActive ? 'تم إيقاف التاجر' : 'تم تفعيل التاجر');
    load();
  };

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

  if (failed.tenant && !tenant) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-sm text-rose-800">ماقدرناش نحمّل بيانات التاجر.</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={load}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (!tenant || (!profile && !failed.profile)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-10" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const status = tenantStatus({
    isActive: tenant.isActive,
    subscriptionStatus: tenant.subscriptionStatus,
    daysLeft: profile?.subscription?.daysLeft ?? null,
  });
  const name = tenant.businessNameAr || tenant.businessName;

  return (
    <div className="space-y-5">
      <Link
        to="/admin/tenants"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowRight className="h-4 w-4" /> التجّار
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-2xl font-black text-white">
              {name.trim().charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">{name}</h1>
                <Badge tone={status.tone}>{status.label}</Badge>
                {profile?.subscription?.planName && (
                  <Badge tone="violet">{profile.subscription.planName}</Badge>
                )}
                {profile && (
                  <Badge tone="slate">{daysLeftLabel(profile.subscription.daysLeft)}</Badge>
                )}
              </div>
              <div className="mt-1 text-sm text-slate-500" dir="auto">
                {[profile?.owner?.fullName, tenant.email, tenant.phone].filter(Boolean).join(' · ')}
              </div>
              <button
                className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-600"
                onClick={() => {
                  navigator.clipboard?.writeText(tenant.id);
                  toast.success('تم نسخ رقم التاجر');
                }}
              >
                <Copy className="h-3 w-3" /> {tenant.id}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadBackup}>
              <Download className="ml-1 h-4 w-4" /> نسخة احتياطية
            </Button>
            <Button
              variant={tenant.isActive ? 'destructive' : 'default'}
              size="sm"
              onClick={toggleActive}
            >
              <Power className="ml-1 h-4 w-4" /> {tenant.isActive ? 'إيقاف التاجر' : 'تفعيل التاجر'}
            </Button>
          </div>
        </div>
        {(profile?.health || []).length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <HealthFlags flags={profile.health} />
          </div>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setParams(key === 'overview' ? {} : { tab: key }, { replace: true })}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!profile && (tab === 'overview' || tab === 'subscription') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-900">
            ملخص التاجر ماتحمّلش دلوقتي. باقي التبويبات (المستخدمين، الصفحات والزراير، الفروع...)
            شغالة عادي.
          </p>
          <Button className="mt-3" size="sm" variant="outline" onClick={load}>
            إعادة المحاولة
          </Button>
        </div>
      )}
      {tab === 'overview' && profile && (
        <OverviewTab profile={profile} onNavigate={(t) => setParams({ tab: t })} />
      )}
      {tab === 'subscription' && profile && (
        <SubscriptionTab id={id!} tenant={tenant} profile={profile} onSaved={load} />
      )}
      {tab === 'features' && <FeaturesTab id={id!} onSaved={load} />}
      {tab === 'users' && <UsersTab id={id!} onSaved={load} />}
      {tab === 'branches' && <BranchesTab id={id!} />}
      {tab === 'activity' && <ActivityTab id={id!} />}
      {tab === 'settings' && <SettingsTab id={id!} tenant={tenant} onSaved={load} />}
    </div>
  );
}
