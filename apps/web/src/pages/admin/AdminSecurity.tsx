import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';
import { KeyRound, LogOut, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { auditLabel, formatDateTime, severityClass } from '@/lib/audit-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuditRow {
  id: string;
  adminEmail: string;
  ip?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  severity?: string;
  createdAt: string;
}

const otpInput = (value: string, set: (v: string) => void) => (
  <Input
    required
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="\d{6}"
    maxLength={6}
    dir="ltr"
    className="text-center tracking-[0.4em]"
    value={value}
    onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 6))}
  />
);

export function AdminSecurityPage() {
  const { admin, refresh, replaceToken, logout } = useAdminAuth();
  const [logs, setLogs] = useState<AuditRow[]>([]);

  // 2FA
  const [setupPassword, setSetupPassword] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(
    null
  );
  const [enableOtp, setEnableOtp] = useState('');
  const [disable, setDisable] = useState({ password: '', otp: '' });
  const [busy, setBusy] = useState(false);

  // password
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const loadLogs = () =>
    adminApi
      .get('/admin/audit-logs', { params: { limit: 100 } })
      .then((r) => setLogs(r.data.data))
      .catch(() => {});
  useEffect(() => {
    loadLogs();
  }, []);

  const startSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await adminApi.post('/admin/auth/2fa/setup', { password: setupPassword });
      const { secret, otpauthUrl } = r.data.data;
      const qr = await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 1 });
      setSetup({ secret, otpauthUrl, qr });
      setSetupPassword('');
    } catch {
      /* interceptor */
    } finally {
      setBusy(false);
    }
  };

  const enable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await adminApi.post('/admin/auth/2fa/enable', { otp: enableOtp });
      if (r.data.data?.accessToken) replaceToken(r.data.data.accessToken);
      toast.success('تم تفعيل المصادقة الثنائية — من الدخول الجاي هيتطلب منك الرمز');
      setSetup(null);
      setEnableOtp('');
      await refresh();
      loadLogs();
    } catch {
      /* interceptor */
    } finally {
      setBusy(false);
    }
  };

  const disable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm('إيقاف المصادقة الثنائية بيقلل حماية لوحة الإدارة. متأكد؟')) return;
    setBusy(true);
    try {
      await adminApi.post('/admin/auth/2fa/disable', disable);
      toast.success('تم إيقاف المصادقة الثنائية');
      setDisable({ password: '', otp: '' });
      await refresh();
      loadLogs();
    } catch {
      /* interceptor */
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) {
      toast.error('كلمة المرور الجديدة وتأكيدها مش متطابقين');
      return;
    }
    setBusy(true);
    try {
      const r = await adminApi.post('/admin/auth/change-password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      if (r.data.data?.accessToken) replaceToken(r.data.data.accessToken);
      toast.success('تم تغيير كلمة المرور وتسجيل الخروج من كل الأجهزة الأخرى');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      loadLogs();
    } catch {
      /* interceptor */
    } finally {
      setBusy(false);
    }
  };

  const logoutAll = async () => {
    if (!window.confirm('تسجيل الخروج من كل الأجهزة (بما فيها الجهاز ده)؟')) return;
    try {
      await adminApi.post('/admin/auth/logout-all');
      toast.success('تم تسجيل الخروج من كل الأجهزة');
      logout();
    } catch {
      /* interceptor */
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">الأمان</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 2FA */}
        <div className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            {admin?.twoFactorEnabled ? (
              <ShieldCheck className="h-6 w-6 text-green-600" />
            ) : (
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            )}
            <div>
              <h2 className="font-semibold">المصادقة الثنائية (2FA)</h2>
              <p
                className={`text-sm ${admin?.twoFactorEnabled ? 'text-green-700' : 'text-amber-700'}`}
              >
                {admin?.twoFactorEnabled
                  ? 'مفعّلة — حسابك محمي برمز من الموبايل'
                  : 'غير مفعّلة — ننصح بشدة بتفعيلها'}
              </p>
            </div>
          </div>

          {!admin?.twoFactorEnabled && !setup && (
            <form onSubmit={startSetup} className="space-y-3">
              <p className="text-sm text-gray-600">
                حتى لو حد عرف كلمة المرور، مش هيقدر يدخل من غير الموبايل بتاعك.
              </p>
              <div>
                <Label>أكد كلمة المرور للبدء</Label>
                <Input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                <Smartphone className="me-2 h-4 w-4" /> ابدأ التفعيل
              </Button>
            </form>
          )}

          {!admin?.twoFactorEnabled && setup && (
            <form onSubmit={enable2fa} className="space-y-3">
              <ol className="list-decimal space-y-1 ps-5 text-sm text-gray-700">
                <li>افتح Google Authenticator أو Microsoft Authenticator.</li>
                <li>امسح الكود ده (أو اكتب المفتاح يدوياً).</li>
                <li>اكتب الرمز اللي ظهر عشان نتأكد.</li>
              </ol>
              <div className="flex flex-col items-center gap-2 rounded-lg border bg-gray-50 p-4">
                <img src={setup.qr} alt="QR code للمصادقة الثنائية" className="h-52 w-52" />
                <code className="select-all break-all text-center font-mono text-xs" dir="ltr">
                  {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
                </code>
              </div>
              <div>
                <Label>الرمز من التطبيق</Label>
                {otpInput(enableOtp, setEnableOtp)}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || enableOtp.length !== 6}>
                  تفعيل
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                  إلغاء
                </Button>
              </div>
            </form>
          )}

          {admin?.twoFactorEnabled && (
            <form onSubmit={disable2fa} className="space-y-3 border-t pt-4">
              <p className="text-sm text-gray-500">
                لإيقافها (مثلاً عند تغيير الموبايل) أكد بكلمة المرور والرمز الحالي:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>كلمة المرور</Label>
                  <Input
                    required
                    type="password"
                    value={disable.password}
                    onChange={(e) => setDisable({ ...disable, password: e.target.value })}
                  />
                </div>
                <div>
                  <Label>الرمز</Label>
                  {otpInput(disable.otp, (otp) => setDisable({ ...disable, otp }))}
                </div>
              </div>
              <Button type="submit" variant="outline" disabled={busy || disable.otp.length !== 6}>
                إيقاف المصادقة الثنائية
              </Button>
            </form>
          )}
        </div>

        {/* password + sessions */}
        <div className="space-y-6">
          <form onSubmit={changePassword} className="space-y-3 rounded-xl border bg-white p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-5 w-5" /> تغيير كلمة المرور
            </h2>
            <div>
              <Label>الحالية</Label>
              <Input
                required
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>الجديدة (12 حرف على الأقل)</Label>
                <Input
                  required
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={pw.newPassword}
                  onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                />
              </div>
              <div>
                <Label>تأكيد</Label>
                <Input
                  required
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" disabled={busy}>
              تغيير
            </Button>
          </form>

          <div className="rounded-xl border bg-white p-6">
            <h2 className="mb-2 font-semibold">الجلسات</h2>
            <p className="mb-3 text-sm text-gray-500">
              آخر دخول: {formatDateTime(admin?.lastLoginAt)}{' '}
              {admin?.lastLoginIp && <span dir="ltr">({admin.lastLoginIp})</span>}
            </p>
            <Button variant="destructive" onClick={logoutAll}>
              <LogOut className="me-2 h-4 w-4" /> خروج من كل الأجهزة
            </Button>
          </div>
        </div>
      </div>

      {/* admin audit log */}
      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">سجل نشاط الإدارة</h2>
          <Button size="sm" variant="outline" onClick={loadLogs}>
            تحديث
          </Button>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="p-3 text-right">الوقت</th>
                <th className="p-3 text-right">الحدث</th>
                <th className="p-3 text-right">بواسطة</th>
                <th className="p-3 text-right">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
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
                    {l.adminEmail}
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {l.ip || '—'}
                  </td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-400">
                    لا يوجد نشاط
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
