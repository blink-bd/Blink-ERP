import { useCallback, useEffect, useState } from 'react';
import { BellRing, Mail, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AlertType {
  key: string;
  label: string;
  enabled: boolean;
}

interface AlertSettings {
  alertEmail: string | null;
  alertWhatsapp: string | null;
  types: AlertType[];
  channels: {
    email: { configured: boolean };
    whatsapp: { configured: boolean; mode?: string };
  };
}

const RESULT_LABEL: Record<string, string> = {
  sent: 'اتبعتت',
  failed: 'فشل الإرسال',
  skipped: 'مش مفعّلة',
};

/**
 * إعدادات تنبيهات التاجر: واتساب وإيميل التاجر لاستقبال تنبيهات حسابه، واختيار
 * أنواع التنبيهات اللي توصله.
 */
export function AlertSettingsSection({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [types, setTypes] = useState<AlertType[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const apply = (data: AlertSettings) => {
    setSettings(data);
    setWhatsapp(data.alertWhatsapp || '');
    setEmail(data.alertEmail || '');
    setTypes(data.types);
  };

  const load = useCallback(async () => {
    try {
      const response = await api.get('/notifications/settings');
      apply(response.data.data);
    } catch {
      // رسالة الخطأ بتظهر من عميل API.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await api.put('/notifications/settings', {
        alertWhatsapp: whatsapp.trim() || null,
        alertEmail: email.trim() || null,
        alertEvents: Object.fromEntries(types.map((type) => [type.key, type.enabled])),
      });
      apply(response.data.data);
      toast.success('تم حفظ إعدادات التنبيهات');
    } catch {
      // رسالة الخطأ بتظهر من عميل API.
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const response = await api.post('/notifications/test');
      const result = response.data.data;
      const parts = [
        settings?.alertWhatsapp ? `واتساب: ${RESULT_LABEL[result.whatsapp] || result.whatsapp}` : '',
        settings?.alertEmail ? `إيميل: ${RESULT_LABEL[result.email] || result.email}` : '',
      ].filter(Boolean);
      if (result.whatsapp === 'sent' || result.email === 'sent') toast.success(parts.join(' — '));
      else toast.error(parts.join(' — ') || 'لم تُرسل الرسالة');
    } catch {
      // رسالة الخطأ بتظهر من عميل API.
    } finally {
      setTesting(false);
    }
  };

  const dirty =
    settings &&
    (whatsapp.trim() !== (settings.alertWhatsapp || '') ||
      email.trim() !== (settings.alertEmail || '') ||
      types.some((type, index) => type.enabled !== settings.types[index]?.enabled));

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <BellRing className="h-5 w-5 text-primary" /> تنبيهات حسابك
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          اكتب رقم الواتساب والإيميل اللي عايز تستقبل عليهم تنبيهات حسابك، واختار التنبيهات اللي
          توصلك.
        </p>
      </div>

      {!settings ? (
        <p className="py-6 text-center text-sm text-gray-400">جاري التحميل…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4 text-[#25D366]" /> رقم الواتساب
              </Label>
              <Input
                dir="ltr"
                inputMode="tel"
                placeholder="01xxxxxxxxx"
                value={whatsapp}
                disabled={!canEdit}
                onChange={(event) => setWhatsapp(event.target.value)}
              />
              {!settings.channels.whatsapp.configured && (
                <p className="mt-1 text-xs text-amber-700">
                  خدمة إرسال الواتساب لسه مش مفعّلة من إدارة النظام — الرقم هيتحفظ والتنبيهات
                  هتبدأ توصل أول ما تتفعّل.
                </p>
              )}
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <Mail className="h-4 w-4 text-primary" /> الإيميل
              </Label>
              <Input
                dir="ltr"
                type="email"
                placeholder="name@example.com"
                value={email}
                disabled={!canEdit}
                onChange={(event) => setEmail(event.target.value)}
              />
              {!settings.channels.email.configured && (
                <p className="mt-1 text-xs text-amber-700">
                  خدمة إرسال الإيميل لسه مش مفعّلة من إدارة النظام — الإيميل هيتحفظ والتنبيهات
                  هتبدأ توصل أول ما تتفعّل.
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">التنبيهات اللي توصلك</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {types.map((type) => (
                <label
                  key={type.key}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${type.enabled ? 'border-primary/40 bg-primary/5' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={type.enabled}
                    disabled={!canEdit}
                    onChange={(event) =>
                      setTypes((current) =>
                        current.map((item) =>
                          item.key === type.key ? { ...item, enabled: event.target.checked } : item
                        )
                      )
                    }
                  />
                  {type.label}
                </label>
              ))}
            </div>
            {!whatsapp.trim() && !email.trim() && (
              <p className="mt-2 text-xs text-gray-500">
                لو سبت الواتساب والإيميل فاضيين، تذكير المديونيات وتجاوز حد الموردين بيوصلوا على
                بيانات التواصل المسجلة لحسابك عند إدارة النظام.
              </p>
            )}
          </div>

          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                disabled={testing || saving || Boolean(dirty) || (!settings.alertWhatsapp && !settings.alertEmail)}
                title={dirty ? 'احفظ التعديلات الأول' : undefined}
                onClick={() => void sendTest()}
              >
                {testing ? 'جاري الإرسال…' : 'إرسال رسالة تجريبية'}
              </Button>
              <Button disabled={saving || !dirty} onClick={() => void save()}>
                {saving ? 'جاري الحفظ…' : 'حفظ'}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
