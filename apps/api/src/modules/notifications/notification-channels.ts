import { decryptSecret, encryptSecret } from '@/common/security/crypto.util';

/**
 * إعدادات قنوات الإرسال (إيميل وواتساب) على مستوى المنصة كلها.
 *
 * بتتحفظ من لوحة المدير العام في جدول platform_settings (الأسرار متشفرة AES-256-GCM)،
 * ولو مش متسجلة بنرجع لمتغيرات البيئة القديمة (MAIL_* و WHATSAPP_*).
 *
 * ملحوظة مهمة: خطة Render المجانية بتقفل منافذ SMTP (25/465/587)، فعشان الإيميل يشتغل
 * عليها لازم مزود بيبعت عن طريق HTTPS (Brevo أو Resend). SMTP بيشتغل على الخطط المدفوعة.
 */
export const CHANNELS_SETTINGS_KEY = 'notification_channels';

export type EmailProvider = 'none' | 'brevo' | 'resend' | 'smtp';
export const EMAIL_PROVIDERS: EmailProvider[] = ['none', 'brevo', 'resend', 'smtp'];

export interface StoredChannels {
  email?: {
    provider?: EmailProvider;
    fromEmail?: string | null;
    fromName?: string | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpSecure?: boolean;
    smtpUser?: string | null;
  };
  whatsapp?: {
    enabled?: boolean;
    phoneNumberId?: string | null;
    apiVersion?: string | null;
    templateName?: string | null;
    templateLanguage?: string | null;
  };
  operator?: { email?: string | null; whatsapp?: string | null };
}

export interface ChannelSecrets {
  smtpPassword?: string;
  emailApiKey?: string;
  whatsappToken?: string;
}

export interface ResolvedChannels {
  source: 'admin' | 'env';
  email: {
    provider: EmailProvider;
    configured: boolean;
    fromEmail?: string;
    fromName: string;
    smtp?: { host: string; port: number; secure: boolean; user: string; pass: string };
    apiKey?: string;
  };
  whatsapp: {
    configured: boolean;
    apiVersion: string;
    phoneNumberId?: string;
    token?: string;
    templateName?: string;
    templateLanguage: string;
  };
  operator: { email: string; whatsapp: string };
}

export const DEFAULT_OPERATOR_EMAIL = 'blinkbusinessdevelopment@gmail.com';
export const DEFAULT_OPERATOR_WHATSAPP = '+201024898091';

type Getter = (key: string) => string | undefined;

const clean = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
};

export function channelsEncryptionKey(get: Getter): string {
  // مفتاح منفصل عن مفاتيح الجلسات لو موجود؛ وإلا مفتاح المدير العام (مطلوب في التشغيل).
  const key =
    clean(get('CHANNELS_ENCRYPTION_KEY')) ||
    clean(get('MASTER_2FA_ENCRYPTION_KEY')) ||
    clean(get('JWT_MASTER_SECRET'));
  if (!key) throw new Error('لا يوجد مفتاح تشفير لإعدادات قنوات الإرسال');
  return `channels:${key}`;
}

export function encryptChannelSecrets(secrets: ChannelSecrets, get: Getter): string | null {
  const compact = Object.fromEntries(
    Object.entries(secrets).filter(([, value]) => typeof value === 'string' && value)
  );
  if (!Object.keys(compact).length) return null;
  return encryptSecret(JSON.stringify(compact), channelsEncryptionKey(get));
}

export function decryptChannelSecrets(payload: string | null | undefined, get: Getter): ChannelSecrets {
  if (!payload) return {};
  try {
    return JSON.parse(decryptSecret(payload, channelsEncryptionKey(get))) as ChannelSecrets;
  } catch {
    // مفتاح التشفير اتغير أو البيانات تالفة: نعتبر الأسرار مش موجودة بدل ما السيرفر يقع.
    return {};
  }
}

/** يدمج إعدادات لوحة المدير العام مع متغيرات البيئة (لوحة المدير العام ليها الأولوية). */
export function resolveChannels(
  stored: StoredChannels | null | undefined,
  secrets: ChannelSecrets,
  get: Getter
): ResolvedChannels {
  const fromAdmin = Boolean(stored && (stored.email?.provider || stored.whatsapp));

  // ---------- Email ----------
  let email: ResolvedChannels['email'];
  if (stored?.email?.provider) {
    const provider = stored.email.provider;
    const fromEmail = clean(stored.email.fromEmail) || clean(stored.email.smtpUser);
    const fromName = clean(stored.email.fromName) || 'Blink ERP';
    if (provider === 'smtp') {
      const host = clean(stored.email.smtpHost);
      const user = clean(stored.email.smtpUser);
      const pass = clean(secrets.smtpPassword);
      email = {
        provider,
        fromEmail,
        fromName,
        configured: Boolean(host && user && pass),
        smtp:
          host && user && pass
            ? {
                host,
                user,
                pass,
                port: Number(stored.email.smtpPort) || 587,
                secure: Boolean(stored.email.smtpSecure),
              }
            : undefined,
      };
    } else if (provider === 'brevo' || provider === 'resend') {
      const apiKey = clean(secrets.emailApiKey);
      email = { provider, fromEmail, fromName, apiKey, configured: Boolean(apiKey && fromEmail) };
    } else {
      email = { provider: 'none', fromName, configured: false };
    }
  } else {
    const host = clean(get('MAIL_HOST'));
    const user = clean(get('MAIL_USER'));
    const pass = clean(get('MAIL_PASSWORD'));
    email = {
      provider: 'smtp',
      fromEmail: clean(get('MAIL_FROM')) || user,
      fromName: 'Blink ERP',
      configured: Boolean(host && user && pass),
      smtp:
        host && user && pass
          ? {
              host,
              user,
              pass,
              port: Number(get('MAIL_PORT') || 587),
              secure: String(get('MAIL_SECURE') || 'false').toLowerCase() === 'true',
            }
          : undefined,
    };
  }

  // ---------- WhatsApp Cloud API ----------
  let whatsapp: ResolvedChannels['whatsapp'];
  if (stored?.whatsapp) {
    const phoneNumberId = clean(stored.whatsapp.phoneNumberId);
    const token = clean(secrets.whatsappToken);
    whatsapp = {
      configured: stored.whatsapp.enabled !== false && Boolean(phoneNumberId && token),
      apiVersion: clean(stored.whatsapp.apiVersion) || 'v23.0',
      phoneNumberId,
      token,
      templateName: clean(stored.whatsapp.templateName),
      templateLanguage: clean(stored.whatsapp.templateLanguage) || 'ar',
    };
  } else {
    const phoneNumberId = clean(get('WHATSAPP_PHONE_NUMBER_ID'));
    const token = clean(get('WHATSAPP_ACCESS_TOKEN'));
    whatsapp = {
      configured: Boolean(phoneNumberId && token),
      apiVersion: clean(get('WHATSAPP_API_VERSION')) || 'v26.0',
      phoneNumberId,
      token,
      templateName: clean(get('WHATSAPP_TEMPLATE_NAME')),
      templateLanguage: clean(get('WHATSAPP_TEMPLATE_LANGUAGE')) || 'ar',
    };
  }

  return {
    source: fromAdmin ? 'admin' : 'env',
    email,
    whatsapp,
    operator: {
      email:
        clean(stored?.operator?.email) || clean(get('NOTIFICATION_EMAIL_TO')) || DEFAULT_OPERATOR_EMAIL,
      whatsapp:
        clean(stored?.operator?.whatsapp) || clean(get('WHATSAPP_TO')) || DEFAULT_OPERATOR_WHATSAPP,
    },
  };
}

export interface DeliveryOutcome {
  result: 'sent' | 'skipped' | 'failed';
  /** سبب الفشل بالعربي (بيظهر للمدير العام بس — مابيتسجلش في الـ logs). */
  error?: string;
}

/** يترجم رد مزود الإرسال لرسالة مفهومة من غير ما يكشف أسرار. */
export async function providerError(response: Response, provider: string): Promise<string> {
  let detail = '';
  try {
    const body: any = await response.json();
    detail = String(
      body?.error?.error_user_msg ||
        body?.error?.message ||
        body?.message ||
        body?.error ||
        body?.name ||
        ''
    ).slice(0, 300);
  } catch {
    // الرد مش JSON
  }
  const hints: Record<number, string> = {
    400: 'البيانات المرسلة مرفوضة',
    401: 'مفتاح/توكن الدخول غلط أو منتهي',
    403: 'الحساب مش مسموح له يبعت (راجع التفعيل أو المرسل المعتمد)',
    404: 'المعرّف غلط (Phone Number ID أو العنوان)',
    422: 'البيانات ناقصة أو غير صحيحة (مثلاً إيميل المرسل مش متوثق)',
    429: 'تعديت حد الإرسال المسموح',
  };
  const hint = hints[response.status] || 'رد غير متوقع من المزود';
  return `${provider}: ${hint} (HTTP ${response.status})${detail ? ` — ${detail}` : ''}`;
}
