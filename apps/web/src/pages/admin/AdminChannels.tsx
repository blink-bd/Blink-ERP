import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, CircleSlash, Mail, MessageCircle, Send, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, Section, Skeleton, fmtDateTime } from './ui';

type Provider = 'none' | 'brevo' | 'resend' | 'smtp';

const PROVIDERS: Array<{ id: Provider; title: string; hint: string; recommended?: boolean }> = [
  {
    id: 'brevo',
    title: 'Brevo',
    hint: 'مجاني 300 رسالة/يوم — مش محتاج دومين، بس توثّق إيميل المرسل',
    recommended: true,
  },
  { id: 'resend', title: 'Resend', hint: 'محتاج دومين متوثق عشان يبعت لأي حد' },
  {
    id: 'smtp',
    title: 'SMTP / Gmail',
    hint: 'مش هيشتغل على خطة Render المجانية (البورتات مقفولة)',
  },
  { id: 'none', title: 'إيقاف الإيميل', hint: 'مفيش إيميلات هتتبعت' },
];

interface Outcome {
  result: 'sent' | 'failed' | 'skipped';
  error?: string;
  to?: string;
}

export function AdminChannelsPage() {
  const [data, setData] = useState<any>(null);
  const [email, setEmail] = useState<any>({});
  const [wa, setWa] = useState<any>({});
  const [operator, setOperator] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState({ email: '', whatsapp: '' });
  const [results, setResults] = useState<{ email: Outcome; whatsapp: Outcome } | null>(null);

  const hydrate = (d: any) => {
    setData(d);
    setEmail({ ...d.email, apiKey: '', smtpPassword: '' });
    setWa({ ...d.whatsapp, accessToken: '' });
    setOperator({ ...d.operator });
  };
  useEffect(() => {
    adminApi.get('/admin/notification-channels').then((r) => hydrate(r.data.data));
  }, []);

  const save = async (clearSecrets: string[] = []) => {
    setSaving(true);
    try {
      const r = await adminApi.put('/admin/notification-channels', {
        email: {
          provider: email.provider,
          fromEmail: email.fromEmail || '',
          fromName: email.fromName || '',
          smtpHost: email.smtpHost || '',
          smtpPort: Number(email.smtpPort) || 587,
          smtpSecure: Boolean(email.smtpSecure),
          smtpUser: email.smtpUser || '',
          smtpPassword: email.smtpPassword || undefined,
          apiKey: email.apiKey || undefined,
        },
        whatsapp: {
          enabled: wa.enabled !== false,
          phoneNumberId: wa.phoneNumberId || '',
          apiVersion: wa.apiVersion || '',
          templateName: wa.templateName || '',
          templateLanguage: wa.templateLanguage || 'ar',
          accessToken: wa.accessToken || undefined,
        },
        operator: { email: operator.email || '', whatsapp: operator.whatsapp || '' },
        clearSecrets: clearSecrets.length ? clearSecrets : undefined,
      });
      hydrate(r.data.data);
      toast.success('تم الحفظ');
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setResults(null);
    try {
      const r = await adminApi.post('/admin/notification-channels/test', {
        email: testTo.email || undefined,
        whatsapp: testTo.whatsapp || undefined,
      });
      setResults(r.data.data);
    } finally {
      setTesting(false);
    }
  };

  if (!data) return <Skeleton className="h-96" />;

  const provider: Provider = email.provider || 'none';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">قنوات الإرسال</h1>
        <p className="text-sm text-slate-500">
          الإيميل والواتساب اللي المنصة بتبعت منهم تنبيهات التجار (مديونيات، حد الموردين، تنبيهات
          الأمان…) وتنبيهات الإدارة. الأسرار بتتحفظ متشفرة ومش بتظهر تاني.
        </p>
        {data.updatedAt && (
          <p className="mt-1 text-xs text-slate-400">
            آخر تعديل {fmtDateTime(data.updatedAt)}{' '}
            {data.updatedBy ? `بواسطة ${data.updatedBy}` : ''}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatusPill
          icon={<Mail className="h-5 w-5" />}
          label="الإيميل"
          ok={data.email.configured}
          detail={data.email.configured ? `عن طريق ${data.email.provider}` : 'مش متظبط'}
        />
        <StatusPill
          icon={<MessageCircle className="h-5 w-5" />}
          label="واتساب"
          ok={data.whatsapp.configured}
          detail={
            data.whatsapp.configured
              ? data.whatsapp.templateName
                ? `قالب ${data.whatsapp.templateName}`
                : 'رسائل نصية (جوه نافذة 24 ساعة بس)'
              : 'مش متظبط'
          }
        />
      </div>

      <Section title="الإيميل" description="اختار مزود الإرسال">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setEmail({ ...email, provider: p.id })}
              className={`rounded-xl border p-3 text-right transition ${
                provider === p.id
                  ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{p.title}</span>
                {p.recommended && <Badge tone="green">مُقترح</Badge>}
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.hint}</p>
            </button>
          ))}
        </div>

        {provider !== 'none' && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>إيميل المرسل</Label>
              <Input
                dir="ltr"
                type="email"
                placeholder="alerts@yourdomain.com"
                value={email.fromEmail || ''}
                onChange={(e) => setEmail({ ...email, fromEmail: e.target.value })}
              />
              {provider === 'brevo' && (
                <p className="mt-1 text-xs text-slate-400">لازم يكون متوثق في Brevo (Senders).</p>
              )}
            </div>
            <div>
              <Label>اسم المرسل</Label>
              <Input
                value={email.fromName || ''}
                onChange={(e) => setEmail({ ...email, fromName: e.target.value })}
              />
            </div>

            {(provider === 'brevo' || provider === 'resend') && (
              <div className="sm:col-span-2">
                <Label>مفتاح API</Label>
                <SecretInput
                  value={email.apiKey}
                  saved={data.email.hasApiKey}
                  placeholder={provider === 'brevo' ? 'xkeysib-...' : 're_...'}
                  onChange={(v) => setEmail({ ...email, apiKey: v })}
                  onClear={() => save(['emailApiKey'])}
                />
              </div>
            )}

            {provider === 'smtp' && (
              <>
                <div>
                  <Label>سيرفر SMTP</Label>
                  <Input
                    dir="ltr"
                    placeholder="smtp.gmail.com"
                    value={email.smtpHost || ''}
                    onChange={(e) => setEmail({ ...email, smtpHost: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>البورت</Label>
                    <Input
                      dir="ltr"
                      type="number"
                      value={email.smtpPort || 587}
                      onChange={(e) => setEmail({ ...email, smtpPort: e.target.value })}
                    />
                  </div>
                  <label className="mt-6 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(email.smtpSecure)}
                      onChange={(e) => setEmail({ ...email, smtpSecure: e.target.checked })}
                    />
                    SSL (465)
                  </label>
                </div>
                <div>
                  <Label>اسم المستخدم</Label>
                  <Input
                    dir="ltr"
                    value={email.smtpUser || ''}
                    onChange={(e) => setEmail({ ...email, smtpUser: e.target.value })}
                  />
                </div>
                <div>
                  <Label>كلمة المرور (App Password)</Label>
                  <SecretInput
                    value={email.smtpPassword}
                    saved={data.email.hasSmtpPassword}
                    onChange={(v) => setEmail({ ...email, smtpPassword: v })}
                    onClear={() => save(['smtpPassword'])}
                  />
                </div>
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 sm:col-span-2">
                  Render (الخطة المجانية) قافل بورتات SMTP من سبتمبر 2025، فـ Gmail/SMTP مش هيشتغل
                  غير على خطة مدفوعة. استخدم Brevo بدلها.
                </p>
              </>
            )}
          </div>
        )}

        {provider === 'brevo' && (
          <Guide title="إزاي أجهّز Brevo (5 دقايق)">
            <li>اعمل حساب مجاني على brevo.com.</li>
            <li>
              من Senders, Domains & Dedicated IPs ← Senders ← Add a sender: اكتب إيميلك (ممكن Gmail)
              وأكّده من الرسالة اللي هتوصلك.
            </li>
            <li>
              من SMTP & API ← API Keys ← Generate a new API key، وانسخ المفتاح (بيبدأ بـ xkeysib-).
            </li>
            <li>
              حط الإيميل اللي وثّقته في «إيميل المرسل» والمفتاح هنا، واحفظ، وبعدين جرّب الإرسال تحت.
            </li>
          </Guide>
        )}
      </Section>

      <Section
        title="واتساب (WhatsApp Cloud API)"
        description="للتنبيهات التلقائية. مشاركة الفواتير مع العملاء شغالة من غيره عن طريق wa.me."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wa.enabled !== false}
              onChange={(e) => setWa({ ...wa, enabled: e.target.checked })}
            />
            مفعّل
          </label>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Phone Number ID</Label>
            <Input
              dir="ltr"
              placeholder="123456789012345"
              value={wa.phoneNumberId || ''}
              onChange={(e) => setWa({ ...wa, phoneNumberId: e.target.value })}
            />
          </div>
          <div>
            <Label>Access Token (دائم)</Label>
            <SecretInput
              value={wa.accessToken}
              saved={data.whatsapp.hasAccessToken}
              placeholder="EAAG..."
              onChange={(v) => setWa({ ...wa, accessToken: v })}
              onClear={() => save(['whatsappToken'])}
            />
          </div>
          <div>
            <Label>اسم القالب المعتمد</Label>
            <Input
              dir="ltr"
              placeholder="blink_alert"
              value={wa.templateName || ''}
              onChange={(e) => setWa({ ...wa, templateName: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              قالب فيه متغير واحد {'{{1}}'} في النص. من غيره الرسالة توصل بس لو الرقم كلّمك آخر 24
              ساعة.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>لغة القالب</Label>
              <Input
                dir="ltr"
                value={wa.templateLanguage || 'ar'}
                onChange={(e) => setWa({ ...wa, templateLanguage: e.target.value })}
              />
            </div>
            <div>
              <Label>إصدار API</Label>
              <Input
                dir="ltr"
                value={wa.apiVersion || 'v23.0'}
                onChange={(e) => setWa({ ...wa, apiVersion: e.target.value })}
              />
            </div>
          </div>
        </div>
        <Guide title="إزاي أجهّز WhatsApp Cloud API">
          <li>من developers.facebook.com اعمل App نوعه Business وضيف له منتج WhatsApp.</li>
          <li>اربط رقم تليفون (مينفعش يكون شغال على تطبيق واتساب العادي) وانسخ Phone Number ID.</li>
          <li>
            من Business Settings ← System Users اعمل مستخدم وولّد له Token دائم بصلاحية
            whatsapp_business_messaging.
          </li>
          <li>
            من WhatsApp Manager ← Message Templates اعمل قالب (Utility) نصه مثلاً: «تنبيه من Blink
            ERP: {'{{1}}'}» واستنى الموافقة.
          </li>
        </Guide>
      </Section>

      <Section
        title="تنبيهات الإدارة"
        description="فين توصلك أنت تنبيهات التجار المهمة (نسخة الإدارة)."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>إيميل الإدارة</Label>
            <Input
              dir="ltr"
              type="email"
              value={operator.email || ''}
              onChange={(e) => setOperator({ ...operator, email: e.target.value })}
            />
          </div>
          <div>
            <Label>واتساب الإدارة</Label>
            <Input
              dir="ltr"
              placeholder="+201xxxxxxxxx"
              value={operator.whatsapp || ''}
              onChange={(e) => setOperator({ ...operator, whatsapp: e.target.value })}
            />
          </div>
        </div>
      </Section>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <Button size="lg" className="shadow-lg" onClick={() => save()} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </Button>
      </div>

      <Section
        title="تجربة الإرسال"
        description="بيبعت رسالة تجريبية بالإعدادات المحفوظة، ولو فشل بيقولك السبب بالظبط. احفظ الأول."
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label>إيميل التجربة</Label>
            <Input
              dir="ltr"
              type="email"
              placeholder={operator.email}
              value={testTo.email}
              onChange={(e) => setTestTo({ ...testTo, email: e.target.value })}
            />
          </div>
          <div>
            <Label>واتساب التجربة</Label>
            <Input
              dir="ltr"
              placeholder={operator.whatsapp}
              value={testTo.whatsapp}
              onChange={(e) => setTestTo({ ...testTo, whatsapp: e.target.value })}
            />
          </div>
          <Button onClick={test} disabled={testing}>
            <Send className="ml-1 h-4 w-4" /> {testing ? 'جاري الإرسال...' : 'ابعت رسالة تجريبية'}
          </Button>
        </div>
        {results && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ResultCard label="الإيميل" outcome={results.email} />
            <ResultCard label="واتساب" outcome={results.whatsapp} />
          </div>
        )}
      </Section>
    </div>
  );
}

function SecretInput({
  value,
  saved,
  placeholder,
  onChange,
  onClear,
}: {
  value?: string;
  saved: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="flex gap-2">
        <Input
          dir="ltr"
          type="password"
          autoComplete="new-password"
          placeholder={saved ? '•••••••• (محفوظ — اكتب جديد لو عايز تغيّره)' : placeholder}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        {saved && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-rose-600"
            onClick={onClear}
          >
            مسح
          </Button>
        )}
      </div>
      {saved && <p className="mt-1 text-xs text-emerald-600">محفوظ ومتشفر ✓</p>}
    </div>
  );
}

function StatusPill({
  icon,
  label,
  ok,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-4 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}
    >
      <span className={ok ? 'text-emerald-600' : 'text-rose-600'}>{icon}</span>
      <div className="flex-1">
        <div className="font-semibold text-slate-900">{label}</div>
        <div className="text-xs text-slate-600">{detail}</div>
      </div>
      {ok ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      ) : (
        <XCircle className="h-5 w-5 text-rose-600" />
      )}
    </div>
  );
}

function ResultCard({ label, outcome }: { label: string; outcome: Outcome }) {
  const tone =
    outcome.result === 'sent'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : outcome.result === 'failed'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <div className={`rounded-xl border p-4 text-sm ${tone}`}>
      <div className="flex items-center gap-2 font-semibold">
        {outcome.result === 'sent' ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : outcome.result === 'failed' ? (
          <XCircle className="h-4 w-4" />
        ) : (
          <CircleSlash className="h-4 w-4" />
        )}
        {label}:{' '}
        {outcome.result === 'sent'
          ? 'اتبعتت ✓'
          : outcome.result === 'failed'
            ? 'فشلت'
            : 'مش متظبطة'}
      </div>
      {outcome.to && (
        <div className="mt-1 text-xs opacity-75" dir="ltr">
          {outcome.to}
        </div>
      )}
      {outcome.error && <div className="mt-2 break-words text-xs">{outcome.error}</div>}
    </div>
  );
}

function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">{title}</summary>
      <ol className="mt-2 list-decimal space-y-1 pr-5 text-slate-600">{children}</ol>
    </details>
  );
}
