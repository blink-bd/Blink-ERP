import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download, DatabaseBackup, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import { usePermissions } from '@/lib/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SettingsPage() {
  const { has } = usePermissions();
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [changing, setChanging] = useState(false);

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/backup/export');
      const backup = res.data?.data ?? res.data;
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      saveBlob(blob, `blink-erp-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('تم تنزيل النسخة الاحتياطية بنجاح');
    } catch {
      // رسالة الخطأ تظهر تلقائياً من interceptor الخاص بالـ API
    } finally {
      setDownloading(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) {
      toast.error('كلمة المرور الجديدة وتأكيدها مش متطابقين');
      return;
    }
    if (pw.newPassword === pw.currentPassword) {
      toast.error('كلمة المرور الجديدة لازم تختلف عن الحالية');
      return;
    }
    setChanging(true);
    try {
      const res = await api.post('/auth/change-password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      // السيرفر بيلغي كل الجلسات القديمة ويرجع توكنات جديدة للجهاز ده بس
      const { accessToken, refreshToken } = res.data.data || {};
      if (accessToken) localStorage.setItem('accessToken', accessToken);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      toast.success('تم تغيير كلمة المرور وتسجيل الخروج من كل الأجهزة الأخرى');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch {
      // interceptor
    } finally {
      setChanging(false);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">الإعدادات</h1>

      <div className="max-w-2xl space-y-6">
        <div className="rounded-xl border bg-white p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-primary/10 p-3 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="mb-1 text-lg font-semibold">تغيير كلمة المرور</h2>
              <p className="mb-4 text-sm text-gray-500">
                حسابك: <span dir="ltr">{user?.email}</span>. بعد التغيير هيتم تسجيل خروجك من أي جهاز
                تاني فوراً.
              </p>
              <form onSubmit={changePassword} className="space-y-3">
                <div>
                  <Label>كلمة المرور الحالية</Label>
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
                    <Label>كلمة المرور الجديدة</Label>
                    <Input
                      required
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      value={pw.newPassword}
                      onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>تأكيد كلمة المرور</Label>
                    <Input
                      required
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      value={pw.confirm}
                      onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  8 أحرف على الأقل وفيها حروف وأرقام، ومتكونش كلمة مشهورة.
                </p>
                <Button type="submit" disabled={changing}>
                  {changing ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
                </Button>
              </form>
            </div>
          </div>
        </div>

        {has('backup.export') && (
          <div className="rounded-xl border bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <DatabaseBackup className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="mb-1 text-lg font-semibold">النسخ الاحتياطي</h2>
                <p className="mb-4 text-sm text-gray-500">
                  تنزيل نسخة كاملة من بيانات متجرك (المنتجات، المبيعات، العملاء، الموردين، المخزون،
                  المصروفات...) بصيغة JSON. البيانات الحساسة مثل كلمات المرور ومفاتيح الـ API لا
                  تُضمَّن في الملف. احتفظ بالملف في مكان آمن.
                </p>
                <Button onClick={downloadBackup} disabled={downloading}>
                  <Download className="me-2 h-4 w-4" />
                  {downloading ? 'جاري التحضير...' : 'تنزيل نسخة احتياطية JSON'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <div>
            كل العمليات الحساسة (دخول، تغيير صلاحيات، حذف، تصدير بيانات، مفاتيح API) بتتسجل في سجل
            التدقيق ومالك النظام يقدر يراجعها. لو لاحظت دخول غريب غيّر كلمة المرور فوراً.
          </div>
        </div>
      </div>
    </div>
  );
}
