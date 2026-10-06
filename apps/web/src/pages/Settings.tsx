import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download, DatabaseBackup } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function SettingsPage() {
  const [downloading, setDownloading] = useState(false);

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/backup/export');
      const backup = res.data?.data ?? res.data;

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `blink-erp-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success('تم تنزيل النسخة الاحتياطية بنجاح');
    } catch {
      // رسالة الخطأ تظهر تلقائياً من interceptor الخاص بالـ API
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">الإعدادات</h1>

      <div className="bg-white rounded-xl border p-6 max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary/10 text-primary">
            <DatabaseBackup className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-1">النسخ الاحتياطي</h2>
            <p className="text-sm text-gray-500 mb-4">
              تنزيل نسخة كاملة من بيانات متجرك (المنتجات، المبيعات، العملاء، الموردين، المخزون،
              المصروفات...) بصيغة JSON. البيانات الحساسة مثل كلمات المرور لا تُضمَّن في الملف.
            </p>
            <Button onClick={downloadBackup} disabled={downloading}>
              <Download className="h-4 w-4 ms-0 me-2" />
              {downloading ? 'جاري التحضير...' : 'تنزيل نسخة احتياطية JSON'}
            </Button>
          </div>
        </div>
      </div>

      <p className="text-gray-400 text-sm mt-6 max-w-2xl">
        إعدادات الهوية البصرية (Branding) والمستخدمين والأدوار تُدار عبر الـ API الموصوف في
        docs/BRANDING_SYSTEM.md و docs/API.md.
      </p>
    </div>
  );
}
