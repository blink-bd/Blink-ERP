import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, KeyRound, LogOut, RefreshCw, Unlock } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section, Skeleton, fmtDateTime, timeAgo } from '../ui';

const ROLE_LABELS: Record<string, string> = {
  owner: 'صاحب النشاط',
  admin: 'مدير',
  manager: 'مدير فرع',
  cashier: 'كاشير',
  accountant: 'محاسب',
};

/** كلمة مرور قوية سهلة القراءة (من غير حروف متشابهة). */
function generatePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!'];
  const all = sets.join('');
  const random = (max: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  };
  const chars = sets.map((s) => s[random(s.length)]);
  while (chars.length < 14) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function UsersTab({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [users, setUsers] = useState<any[] | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await adminApi.get(`/admin/tenants/${id}/users`);
    setUsers(r.data.data);
  };
  useEffect(() => {
    load();
  }, [id]);

  const openReset = (userId: string) => {
    setResetFor(userId);
    setPassword(generatePassword());
  };

  const doReset = async () => {
    if (!resetFor || password.length < 8) {
      toast.error('كلمة المرور لازم 8 أحرف على الأقل');
      return;
    }
    setSaving(true);
    try {
      await adminApi.post(`/admin/tenants/${id}/reset-user-password`, {
        userId: resetFor,
        newPassword: password,
      });
      navigator.clipboard?.writeText(password).catch(() => undefined);
      toast.success(
        'تم تغيير كلمة المرور ونسخها — ابعتها للمستخدم. تم تسجيل خروجه من كل الأجهزة.',
        { duration: 6000 }
      );
      setResetFor(null);
      setPassword('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (userId: string) => {
    if (!window.confirm('هيتم تسجيل خروج المستخدم ده من كل الأجهزة. متأكد؟')) return;
    await adminApi.post(`/admin/tenants/${id}/users/${userId}/revoke-sessions`);
    toast.success('تم تسجيل خروجه من كل الأجهزة');
  };

  const unlock = async (userId: string) => {
    await adminApi.post(`/admin/tenants/${id}/users/${userId}/unlock`);
    toast.success('تم فك القفل');
    load();
    onSaved();
  };

  if (!users) return <Skeleton className="h-64" />;

  return (
    <Section
      title={`المستخدمين (${users.length})`}
      description="كلمات المرور بتتغير من هنا بس — التاجر وموظفينه مش هيقدروا يغيروها بنفسهم."
    >
      {users.length === 0 ? (
        <EmptyState>مفيش مستخدمين</EmptyState>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
            return (
              <div key={u.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{u.fullName}</span>
                      {(u.roles || []).map((r: any) => (
                        <Badge key={r.name} tone={r.name === 'owner' ? 'violet' : 'blue'}>
                          {r.nameAr || ROLE_LABELS[r.name] || r.name}
                        </Badge>
                      ))}
                      {locked ? (
                        <Badge tone="red">مقفول مؤقتاً</Badge>
                      ) : u.isActive ? (
                        <Badge tone="green">نشط</Badge>
                      ) : (
                        <Badge tone="slate">موقوف</Badge>
                      )}
                    </div>
                    <div
                      className="mt-0.5 text-xs text-slate-500"
                      dir="ltr"
                      style={{ textAlign: 'right' }}
                    >
                      {[u.email, u.phone].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {locked && (
                      <Button size="sm" variant="outline" onClick={() => unlock(u.id)}>
                        <Unlock className="ml-1 h-4 w-4" /> فك القفل
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => revoke(u.id)}>
                      <LogOut className="ml-1 h-4 w-4" /> خروج من كل الأجهزة
                    </Button>
                    <Button size="sm" onClick={() => openReset(u.id)}>
                      <KeyRound className="ml-1 h-4 w-4" /> تغيير كلمة المرور
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <Info
                    label="آخر دخول"
                    value={u.lastLoginAt ? `${timeAgo(u.lastLoginAt)}` : 'عمره ما دخل'}
                    title={fmtDateTime(u.lastLoginAt)}
                  />
                  <Info
                    label="آخر IP"
                    value={
                      <span dir="ltr" className="font-mono">
                        {u.lastLoginIp || '—'}
                      </span>
                    }
                  />
                  <Info
                    label="آخر تغيير لكلمة المرور"
                    value={u.passwordChangedAt ? timeAgo(u.passwordChangedAt) : '—'}
                  />
                  <Info
                    label="الفروع"
                    value={u.accessAllBranches ? 'كل الفروع' : `${u.allowedBranches} فرع`}
                  />
                  {u.failedLoginAttempts > 0 && (
                    <Info
                      label="محاولات فاشلة متتالية"
                      value={<span className="text-rose-600">{u.failedLoginAttempts}</span>}
                    />
                  )}
                </div>

                {resetFor === u.id && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <div className="mb-2 text-xs text-slate-500">
                      كلمة المرور الجديدة (اتولدت تلقائياً — تقدر تكتب غيرها):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="w-56 font-mono"
                        dir="ltr"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPassword(generatePassword())}
                        title="توليد جديدة"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard?.writeText(password);
                          toast.success('اتنسخت');
                        }}
                        title="نسخ"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={doReset} disabled={saving}>
                        {saving ? 'جاري الحفظ...' : 'حفظ'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetFor(null)}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function Info({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2" title={title}>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 font-medium text-slate-700">{value}</div>
    </div>
  );
}
