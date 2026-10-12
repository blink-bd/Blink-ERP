import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BellRing, Copy, DatabaseBackup, Download, ExternalLink, KeyRound, Plus, RefreshCw, RotateCw, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import { usePermissions } from '@/lib/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

interface ChannelStatus {
  email: { configured: boolean; recipient: string };
  whatsapp: { configured: boolean; recipient: string; mode: string };
}
interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}
interface Delivery {
  id: string;
  eventType: string;
  status: string;
  httpStatus?: number;
  errorMessage?: string;
  attemptedAt: string;
}

const eventOptions = [
  { id: 'sale.created', label: 'إنشاء فاتورة بيع' },
  { id: 'purchase.created', label: 'إنشاء فاتورة مشتريات' },
  { id: 'inventory.low_stock', label: 'انخفاض المخزون' },
  { id: 'inventory.transfer.requested', label: 'طلب تحويل جديد' },
  { id: 'inventory.transfer.approved', label: 'اعتماد تحويل' },
  { id: 'inventory.transfer.rejected', label: 'رفض تحويل' },
  { id: 'backup.completed', label: 'اكتمال النسخ الاحتياطي' },
];

export function SettingsPage() {
  const { has } = usePermissions();
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [changing, setChanging] = useState(false);
  const [channels, setChannels] = useState<ChannelStatus | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['sale.created']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [signingSecret, setSigningSecret] = useState('');
  const [deliveries, setDeliveries] = useState<{ endpointId: string; records: Delivery[] } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [channelResponse, webhookResponse] = await Promise.all([
        api.get('/notifications/status'),
        api.get('/webhooks'),
      ]);
      setChannels(channelResponse.data.data);
      setWebhooks(webhookResponse.data.data || []);
    } catch {
      // يعرض عميل API رسالة الخطأ.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const response = await api.get('/backup/export');
      const backup = response.data?.data ?? response.data;
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      saveBlob(blob, `blink-erp-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('تم تنزيل النسخة الاحتياطية بنجاح');
    } catch {
      // يعرض عميل API رسالة الخطأ.
    } finally {
      setDownloading(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
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
      await api.post('/auth/change-password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      // The server rotates the HttpOnly auth cookies; never persist tokens in browser storage.
      toast.success('تم تغيير كلمة المرور وتسجيل الخروج من كل الأجهزة الأخرى');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch {
      // يعرض عميل API رسالة الخطأ.
    } finally {
      setChanging(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const response = await api.post('/notifications/test');
      const result = response.data.data;
      const sent = [result.email, result.whatsapp].filter(
        (status: string) => status === 'sent'
      ).length;
      if (sent) toast.success(`تم إرسال اختبار إلى ${sent} قناة`);
      else toast.error('لم تُرسل رسالة: أضف إعدادات SMTP أو WhatsApp Cloud API في Render.');
      await load();
    } catch {
      // يعرض عميل API رسالة الخطأ.
    } finally {
      setTesting(false);
    }
  };

  const saveWebhook = async (event: FormEvent) => {
    event.preventDefault();
    if (!events.length) {
      toast.error('اختر حدثاً واحداً على الأقل');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post('/webhooks', { url: url.trim(), events });
      setSigningSecret(response.data.data.signingSecret || '');
      setUrl('');
      toast.success('تم إنشاء Webhook؛ انسخ مفتاح التوقيع واحفظه بأمان الآن.');
      await load();
    } catch {
      // يعرض عميل API رسالة الخطأ.
    } finally {
      setSaving(false);
    }
  };

  const rotateSecret = async (webhook: Webhook) => {
    if (!window.confirm('سيصبح المفتاح الحالي غير صالح فوراً. هل تريد تدويره؟')) return;
    try {
      const response = await api.post(`/webhooks/${webhook.id}/rotate-secret`);
      setSigningSecret(response.data.data.signingSecret || '');
      toast.success('تم تدوير المفتاح. احفظ المفتاح الجديد الآن.');
      await load();
    } catch {
      // يعرض عميل API رسالة الخطأ.
    }
  };

  const testWebhook = async (webhook: Webhook) => {
    try {
      const response = await api.post(`/webhooks/${webhook.id}/test`);
      const delivery = response.data.data.delivery as Delivery;
      if (delivery.status === 'succeeded') toast.success('تم استلام الاختبار بنجاح');
      else
        toast.error(`فشل الاختبار${delivery.httpStatus ? ` (HTTP ${delivery.httpStatus})` : ''}`);
      await showDeliveries(webhook);
    } catch {
      // يعرض عميل API رسالة الخطأ.
    }
  };

  const showDeliveries = async (webhook: Webhook) => {
    try {
      const response = await api.get(`/webhooks/${webhook.id}/deliveries`);
      setDeliveries({ endpointId: webhook.id, records: response.data.data || [] });
    } catch {
      // يعرض عميل API رسالة الخطأ.
    }
  };

  const deleteWebhook = async (webhook: Webhook) => {
    if (!window.confirm(`حذف Webhook ${webhook.url}؟`)) return;
    try {
      await api.delete(`/webhooks/${webhook.id}`);
      if (deliveries?.endpointId === webhook.id) setDeliveries(null);
      toast.success('تم حذف الرابط');
      await load();
    } catch {
      // يعرض عميل API رسالة الخطأ.
    }
  };

  const toggleEvent = (event: string) => {
    setEvents((previous) =>
      previous.includes(event) ? previous.filter((value) => value !== event) : [...previous, event]
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الإعدادات والتكاملات</h1>
          <p className="mt-1 text-sm text-gray-500">
            أمان الحساب، النسخ الاحتياطي، البريد وWhatsApp وروابط Webhook الصادرة.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="ml-2 h-4 w-4" /> تحديث
        </Button>
      </div>

      <div className="max-w-3xl space-y-6">
        <section className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-start gap-4">
            <div className="rounded-lg bg-primary/10 p-3 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">تغيير كلمة المرور</h2>
              <p className="mt-1 text-sm text-gray-500">
                حسابك: <span dir="ltr">{user?.email}</span>. سيتم إنهاء الجلسات الأخرى بعد التغيير.
              </p>
            </div>
          </div>
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <Label>كلمة المرور الحالية</Label>
              <Input
                required
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(event) => setPw({ ...pw, currentPassword: event.target.value })}
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
                  onChange={(event) => setPw({ ...pw, newPassword: event.target.value })}
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
                  onChange={(event) => setPw({ ...pw, confirm: event.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">8 أحرف على الأقل، وتحتوي على حروف وأرقام.</p>
            <Button type="submit" disabled={changing}>
              {changing ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
            </Button>
          </form>
        </section>

        {has('backup.export') && (
          <section className="rounded-xl border bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <DatabaseBackup className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="mb-1 text-lg font-semibold">النسخ الاحتياطي</h2>
                <p className="mb-4 text-sm text-gray-500">
                  تنزيل نسخة من بيانات المتجر بصيغة JSON. كلمات المرور ومفاتيح API لا تُضمّن في الملف؛ احتفظ به في مكان آمن.
                </p>
                <Button onClick={() => void downloadBackup()} disabled={downloading}>
                  <Download className="me-2 h-4 w-4" />
                  {downloading ? 'جاري التحضير...' : 'تنزيل نسخة احتياطية JSON'}
                </Button>
              </div>
            </div>
          </section>
        )}

        <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <div>
            العمليات الحساسة تُسجّل في سجل التدقيق، ومالك النظام يستطيع مراجعتها. إذا لاحظت دخولاً غير معتاد، غيّر كلمة المرور فوراً.
          </div>
        </div>
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <BellRing className="h-5 w-5 text-primary" /> قنوات التنبيه
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              تصل إشعارات البيع والمخزون والتحويلات إلى العناوين المحددة في إعدادات الخادم.
            </p>
          </div>
          <Button onClick={() => void sendTest()} disabled={testing || loading}>
            {testing ? 'جاري الإرسال…' : 'إرسال رسالة اختبار'}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ChannelCard
            title="البريد الإلكتروني"
            recipient={channels?.email.recipient || 'blinkbusinessdevelopment@gmail.com'}
            configured={channels?.email.configured || false}
            hint="يحتاج SMTP ومفتاح تطبيق Gmail؛ لا تُدخل كلمة المرور في الواجهة."
          />
          <ChannelCard
            title="WhatsApp"
            recipient={channels?.whatsapp.recipient || '+201024898091'}
            configured={channels?.whatsapp.configured || false}
            hint={
              channels?.whatsapp.mode === 'template'
                ? 'إرسال عبر قالب معتمد من Meta.'
                : 'الرسائل الحرة تتطلب نافذة محادثة WhatsApp مفتوحة؛ التنبيهات خارجها تحتاج قالباً معتمداً.'
            }
          />
        </div>
        {!channels?.email.configured && !channels?.whatsapp.configured && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            القنوات غير مفعّلة بعد. أضف أسرار SMTP أو WhatsApp Cloud API في متغيرات البيئة على
            Render.
          </p>
        )}
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold">Webhooks الصادرة</h2>
          <p className="mt-1 text-sm text-gray-500">
            يرسل النظام أحداثاً موقّعة بـ HMAC إلى روابط HTTPS عامة تختارها.
          </p>
        </div>
        <form onSubmit={saveWebhook} className="rounded-lg border bg-gray-50 p-4">
          <div>
            <Label>رابط HTTPS</Label>
            <Input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/webhooks/blink"
              required
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {eventOptions.map((event) => (
              <label key={event.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={events.includes(event.id)}
                  onChange={() => toggleEvent(event.id)}
                />
                <span>{event.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={saving}>
              <Plus className="ml-2 h-4 w-4" /> {saving ? 'جاري الحفظ…' : 'إضافة Webhook'}
            </Button>
          </div>
        </form>

        {signingSecret && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="font-bold text-emerald-900">مفتاح التوقيع (يُعرض مرة واحدة)</h3>
            <p className="mt-1 break-all font-mono text-sm">{signingSecret}</p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(signingSecret)}
            >
              <Copy className="ml-2 h-4 w-4" /> نسخ المفتاح
            </Button>
            <Button
              className="mr-2 mt-3"
              size="sm"
              variant="ghost"
              onClick={() => setSigningSecret('')}
            >
              إخفاء
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="py-5 text-center text-gray-500">جاري التحميل…</p>
          ) : webhooks.length === 0 ? (
            <p className="py-5 text-center text-gray-500">لم تتم إضافة Webhooks بعد.</p>
          ) : (
            webhooks.map((webhook) => (
              <article key={webhook.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-all font-medium">{webhook.url}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${webhook.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {webhook.isActive ? 'نشط' : 'متوقف'}
                      </span>
                      <a
                        href={webhook.url}
                        target="_blank"
                        rel="noreferrer"
                        title="فتح الرابط"
                        className="text-gray-400"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      الأحداث:{' '}
                      {webhook.events
                        .map(
                          (event) =>
                            eventOptions.find((option) => option.id === event)?.label || event
                        )
                        .join('، ')}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      أُضيف في {new Date(webhook.createdAt).toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void testWebhook(webhook)}>
                      اختبار
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void showDeliveries(webhook)}
                    >
                      سجل التسليم
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="تدوير المفتاح"
                      onClick={() => void rotateSecret(webhook)}
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="حذف"
                      onClick={() => void deleteWebhook(webhook)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                {deliveries?.endpointId === webhook.id && (
                  <div className="mt-4 border-t pt-3">
                    <h3 className="mb-2 text-sm font-semibold">آخر محاولات التسليم</h3>
                    {deliveries.records.length === 0 ? (
                      <p className="text-sm text-gray-400">لا توجد محاولات بعد.</p>
                    ) : (
                      <div className="space-y-2">
                        {deliveries.records.map((delivery) => (
                          <div
                            key={delivery.id}
                            className="flex flex-wrap justify-between gap-2 rounded bg-gray-50 px-3 py-2 text-xs"
                          >
                            <span>{delivery.eventType}</span>
                            <span
                              className={
                                delivery.status === 'succeeded'
                                  ? 'text-emerald-700'
                                  : 'text-red-600'
                              }
                            >
                              {delivery.status === 'succeeded'
                                ? 'تم التسليم'
                                : `فشل${delivery.httpStatus ? ` (${delivery.httpStatus})` : ''}`}
                            </span>
                            <span className="text-gray-400">
                              {new Date(delivery.attemptedAt).toLocaleString('ar-EG')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))
          )}
        </div>
        <p className="mt-4 text-xs text-gray-400">
          كل محاولة تُسجّل. عند فشل الإرسال لا يتم تكراره تلقائياً حالياً؛ راجع السجل وأعد الاختبار
          بعد إصلاح وجهة Webhook.
        </p>
      </section>
    </div>
  );
}

function ChannelCard({
  title,
  recipient,
  configured,
  hint,
}: {
  title: string;
  recipient: string;
  configured: boolean;
  hint: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
        >
          {configured ? 'مفعّل' : 'غير مفعّل'}
        </span>
      </div>
      <p className="mt-2 text-sm" dir="ltr">
        {recipient}
      </p>
      <p className="mt-2 text-xs leading-5 text-gray-500">{hint}</p>
    </div>
  );
}
