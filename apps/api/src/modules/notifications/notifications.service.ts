import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import nodemailer, { Transporter } from 'nodemailer';
import { DataSource } from 'typeorm';
import { DEFAULT_TENANT_TIMEZONE, safeTimezone } from '@/common/utils/tenant-time';

export interface OperationalAlert {
  event: string;
  title: string;
  details: Record<string, unknown>;
}

type ChannelResult = 'sent' | 'skipped' | 'failed';

/**
 * أنواع تنبيهات التاجر اللي يقدر يفعّلها/يقفلها من «الإعدادات».
 * التنبيهات بتوصل على واتساب وإيميل التاجر اللي حافظهم في الإعدادات.
 */
export const TENANT_ALERT_TYPES = [
  { key: 'sales', label: 'فاتورة بيع جديدة', events: ['sale.created'] },
  { key: 'purchases', label: 'فاتورة مشتريات جديدة', events: ['purchase.created'] },
  { key: 'returns', label: 'مرتجع مبيعات جديد', events: ['sale.return.created'] },
  { key: 'low_stock', label: 'نقص أو نفاد المخزون', events: ['inventory.low_stock'] },
  {
    key: 'transfers',
    label: 'تحويلات المخزون بين الفروع',
    events: [
      'inventory.transfer.requested',
      'inventory.transfer.approved',
      'inventory.transfer.rejected',
    ],
  },
  {
    key: 'balance_reminders',
    label: 'تذكير مديونيات العملاء والموردين',
    events: ['balance.customer_overdue', 'balance.supplier_due'],
  },
  {
    key: 'supplier_limit',
    label: 'تجاوز حد مستحقات الموردين',
    events: ['supplier.payables_limit_exceeded'],
  },
] as const;

export type TenantAlertType = (typeof TENANT_ALERT_TYPES)[number]['key'];

export function alertTypeForEvent(event: string): TenantAlertType | undefined {
  return TENANT_ALERT_TYPES.find((type) => (type.events as readonly string[]).includes(event))?.key;
}

/** null/undefined = كل الأنواع مفعّلة (الافتراضي). */
export function isTenantAlertEnabled(
  alertEvents: Record<string, boolean> | null | undefined,
  event: string
): boolean {
  const type = alertTypeForEvent(event);
  if (!type) return true;
  return alertEvents?.[type] !== false;
}

/** أسماء عربية لتفاصيل التنبيه اللي بتوصل للتاجر. */
const DETAIL_LABELS: Record<string, string> = {
  saleNumber: 'رقم الفاتورة',
  purchaseNumber: 'رقم فاتورة الشراء',
  returnNumber: 'رقم المرتجع',
  transferNumber: 'رقم التحويل',
  total: 'الإجمالي',
  paidAmount: 'المدفوع',
  paymentStatus: 'حالة الدفع',
  itemCount: 'عدد الأصناف',
  receiptUrl: 'رابط الإيصال',
  status: 'الحالة',
  productName: 'الصنف',
  availableQuantity: 'الكمية المتاحة',
  minimumQuantity: 'حد إعادة الطلب',
  quantity: 'الكمية',
  reason: 'السبب',
  notes: 'ملاحظات',
  sourceBranch: 'من فرع',
  destinationBranch: 'إلى فرع',
  sourceWarehouse: 'من مخزن',
  destinationWarehouse: 'إلى مخزن',
  items: 'الأصناف',
};

const VALUE_LABELS: Record<string, string> = {
  paid: 'مدفوع',
  partial: 'مدفوع جزئياً',
  pending: 'آجل',
  pending_inspection: 'بانتظار الفحص',
  completed: 'مكتمل',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

interface TenantAlertSettings {
  businessName: string;
  timezone: string;
  alertEmail?: string | null;
  alertWhatsapp?: string | null;
  accountEmail?: string | null;
  accountPhone?: string | null;
  alertEvents?: Record<string, boolean> | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private mailTransport?: Transporter;
  private readonly tenantCache = new Map<
    string,
    { value: TenantAlertSettings; expiresAt: number }
  >();

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource
  ) {}

  /** إعدادات تنبيهات التاجر (كاش 30 ثانية). */
  async getTenantAlertSettings(tenantId: string): Promise<TenantAlertSettings | undefined> {
    if (!this.dataSource) return undefined;
    const cached = this.tenantCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const [row] = await this.dataSource.query(
      `SELECT COALESCE(business_name_ar, business_name) AS "businessName", timezone,
              alert_email AS "alertEmail", alert_whatsapp AS "alertWhatsapp",
              email AS "accountEmail", phone AS "accountPhone", alert_events AS "alertEvents"
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (!row) return undefined;
    const value: TenantAlertSettings = { ...row, timezone: safeTimezone(row.timezone) };
    this.tenantCache.set(tenantId, { value, expiresAt: Date.now() + 30_000 });
    return value;
  }

  invalidateTenant(tenantId: string) {
    this.tenantCache.delete(tenantId);
  }

  /**
   * تنبيه خاص بحساب تاجر: بيوصل لإدارة النظام (زي الأول) ولواتساب/إيميل التاجر اللي
   * حافظهم في الإعدادات — لو نوع التنبيه ده مفعّل عنده. كل طرف بيستلم رسالته لوحده.
   */
  async sendTenantAlert(
    tenantId: string,
    alert: OperationalAlert,
    options: { fallbackToAccountContacts?: boolean } = {}
  ): Promise<{ email: ChannelResult; whatsapp: ChannelResult }> {
    let settings: TenantAlertSettings | undefined;
    try {
      settings = await this.getTenantAlertSettings(tenantId);
    } catch (error) {
      this.logger.warn(`Could not load tenant alert settings: ${this.safeError(error)}`);
    }
    const operatorAlert: OperationalAlert = {
      ...alert,
      details: { التاجر: settings?.businessName || tenantId, ...alert.details, tenantId },
    };
    const operator = this.sendOperationalAlert(operatorAlert, undefined, {
      timezone: settings?.timezone,
    });
    if (!settings || !isTenantAlertEnabled(settings.alertEvents, alert.event)) return operator;

    const email =
      settings.alertEmail ||
      (options.fallbackToAccountContacts ? settings.accountEmail : undefined) ||
      undefined;
    const whatsapp =
      settings.alertWhatsapp ||
      (options.fallbackToAccountContacts ? settings.accountPhone : undefined) ||
      undefined;
    if (!email && !whatsapp) return operator;

    const merchantMessage = this.formatMessage(
      { ...alert, details: this.friendlyDetails(alert.details) },
      settings.timezone,
      settings.businessName
    );
    const [operatorResult, merchantEmail, merchantWhatsapp] = await Promise.all([
      operator,
      email ? this.sendEmail(alert.title, merchantMessage, [email]) : 'skipped',
      whatsapp ? this.sendWhatsApp(merchantMessage, [whatsapp]) : 'skipped',
    ]);
    return {
      email: this.combine(operatorResult.email, merchantEmail as ChannelResult),
      whatsapp: this.combine(operatorResult.whatsapp, merchantWhatsapp as ChannelResult),
    };
  }

  /** رسالة تجريبية لواتساب/إيميل التاجر بس (من صفحة الإعدادات). */
  async sendTenantTest(
    tenantId: string,
    recipients: { email?: string | null; whatsapp?: string | null },
    userEmail?: string
  ): Promise<{ email: ChannelResult; whatsapp: ChannelResult }> {
    const settings = await this.getTenantAlertSettings(tenantId);
    const message = this.formatMessage(
      {
        event: 'system.test',
        title: 'رسالة تجريبية لتنبيهات حسابك',
        details: {
          المستخدم: userEmail || '-',
          الرسالة: 'التنبيهات المفعّلة في الإعدادات هتوصلك على هذا الرقم/الإيميل.',
        },
      },
      settings?.timezone,
      settings?.businessName
    );
    const [email, whatsapp] = await Promise.all([
      recipients.email
        ? this.sendEmail('رسالة تجريبية لتنبيهات حسابك', message, [recipients.email])
        : ('skipped' as ChannelResult),
      recipients.whatsapp
        ? this.sendWhatsApp(message, [recipients.whatsapp])
        : ('skipped' as ChannelResult),
    ]);
    return { email, whatsapp };
  }

  private combine(a: ChannelResult, b: ChannelResult): ChannelResult {
    if (a === 'sent' || b === 'sent') return 'sent';
    if (a === 'failed' || b === 'failed') return 'failed';
    return 'skipped';
  }

  private friendlyDetails(details: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      if (key === 'tenantId' || /Id$/.test(key) || key === 'id') continue;
      const label = (DETAIL_LABELS[key] || key).replace(/_/g, ' ');
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        out[label] = value
          .map((entry: any) =>
            entry && typeof entry === 'object'
              ? [
                  entry.productName || entry.name,
                  entry.quantity != null ? `× ${entry.quantity}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              : String(entry)
          )
          .join('، ');
        continue;
      }
      out[label] = typeof value === 'string' && VALUE_LABELS[value] ? VALUE_LABELS[value] : value;
    }
    return out;
  }

  getStatus() {
    const email = this.isEmailConfigured();
    const whatsapp = this.isWhatsAppConfigured();
    return {
      email: {
        configured: email,
        recipient:
          this.config.get<string>('NOTIFICATION_EMAIL_TO') || 'blinkbusinessdevelopment@gmail.com',
      },
      whatsapp: {
        configured: whatsapp,
        recipient: this.config.get<string>('WHATSAPP_TO') || '+201024898091',
        mode: this.config.get<string>('WHATSAPP_TEMPLATE_NAME') ? 'template' : 'text',
      },
    };
  }

  async sendOperationalAlert(
    alert: OperationalAlert,
    recipients?: { email?: string; whatsapp?: string },
    options: { timezone?: string } = {}
  ): Promise<{ email: ChannelResult; whatsapp: ChannelResult }> {
    const message = this.formatMessage(alert, options.timezone);
    const operatorEmail = (
      this.config.get<string>('NOTIFICATION_EMAIL_TO') || 'blinkbusinessdevelopment@gmail.com'
    ).trim();
    const operatorWhatsapp = (this.config.get<string>('WHATSAPP_TO') || '+201024898091').trim();
    const extraEmail = recipients?.email?.trim();
    const extraWhatsapp = recipients?.whatsapp?.trim();
    // كل مستلم بياخد رسالته لوحده — التاجر ما يشوفش عناوين إدارة النظام والعكس.
    const emailGroups = [
      [operatorEmail],
      extraEmail && extraEmail !== operatorEmail ? [extraEmail] : [],
    ].filter((group) => group.length && group.every(Boolean)) as string[][];
    const whatsappRecipients = Array.from(
      new Set([operatorWhatsapp, extraWhatsapp].filter((value): value is string => Boolean(value)))
    );
    const [emailResults, whatsapp] = await Promise.all([
      Promise.all(emailGroups.map((group) => this.sendEmail(alert.title, message, group))),
      this.sendWhatsApp(message, whatsappRecipients),
    ]);
    const email = emailResults.length
      ? emailResults.reduce((acc, result) => this.combine(acc, result), 'skipped' as ChannelResult)
      : 'skipped';
    return { email, whatsapp };
  }

  async sendBackupAlert(status: 'success' | 'failed', objectKey?: string, details?: string) {
    return this.sendOperationalAlert({
      event: 'backup.completed',
      title: status === 'success' ? 'اكتمل النسخ الاحتياطي' : 'فشل النسخ الاحتياطي',
      details: {
        الحالة: status === 'success' ? 'نجاح' : 'فشل',
        الملف: objectKey || 'غير متاح',
        التفاصيل: details || 'لا توجد تفاصيل إضافية',
        الوقت: new Date().toISOString(),
      },
    });
  }

  private isEmailConfigured(): boolean {
    return Boolean(
      this.config.get<string>('MAIL_HOST') &&
      this.config.get<string>('MAIL_USER') &&
      this.config.get<string>('MAIL_PASSWORD')
    );
  }

  private isWhatsAppConfigured(): boolean {
    return Boolean(
      this.config.get<string>('WHATSAPP_ACCESS_TOKEN') &&
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')
    );
  }

  private formatMessage(alert: OperationalAlert, timezone?: string, businessName?: string): string {
    const details = Object.entries(alert.details)
      .map(([key, value]) => {
        const printable = typeof value === 'string' ? value : JSON.stringify(value);
        return `${key}: ${printable ?? '-'}`;
      })
      .join('\n');
    const header = businessName ? `Blink ERP — ${businessName}` : 'Blink ERP';
    const time = new Date().toLocaleString('ar-EG', {
      timeZone: safeTimezone(timezone || DEFAULT_TENANT_TIMEZONE),
    });
    // رسالة التاجر (businessName) من غير اسم الحدث التقني.
    const eventLine = businessName ? '' : `الحدث: ${alert.event}\n`;
    const message = `${header}\n${alert.title}\n${eventLine}${details}\nالوقت: ${time}`;
    return message.length > 3500 ? `${message.slice(0, 3480)}\n… تم اختصار التفاصيل` : message;
  }

  private getMailTransport(): Transporter {
    if (this.mailTransport) return this.mailTransport;
    const port = Number(this.config.get<string>('MAIL_PORT') || 587);
    const secure =
      String(this.config.get<string>('MAIL_SECURE') || 'false').toLowerCase() === 'true';
    this.mailTransport = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port,
      secure,
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASSWORD'),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    return this.mailTransport;
  }

  private async sendEmail(
    subject: string,
    text: string,
    recipients: string[]
  ): Promise<ChannelResult> {
    if (!this.isEmailConfigured() || recipients.length === 0) return 'skipped';
    try {
      const from = this.config.get<string>('MAIL_FROM') || this.config.get<string>('MAIL_USER');
      await this.getMailTransport().sendMail({
        from,
        to: recipients.join(', '),
        subject: `[Blink ERP] ${subject}`,
        text,
      });
      return 'sent';
    } catch (error) {
      this.logger.warn(`Email delivery failed: ${this.safeError(error)}`);
      return 'failed';
    }
  }

  private async sendWhatsApp(message: string, recipients: string[]): Promise<ChannelResult> {
    if (!this.isWhatsAppConfigured()) return 'skipped';

    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION') || 'v26.0';
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const templateName = this.config.get<string>('WHATSAPP_TEMPLATE_NAME');
    const language = this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') || 'ar';
    const normalizedRecipients = Array.from(
      new Set(recipients.map((recipient) => recipient.replace(/[^\d]/g, '')).filter(Boolean))
    );
    if (normalizedRecipients.length === 0) return 'skipped';

    const results = await Promise.all(
      normalizedRecipients.map(async (recipient): Promise<ChannelResult> => {
        const payload = templateName
          ? {
              messaging_product: 'whatsapp',
              to: recipient,
              type: 'template',
              template: {
                name: templateName,
                language: { code: language },
                components: [
                  {
                    type: 'body',
                    parameters: [{ type: 'text', text: message.slice(0, 1024) }],
                  },
                ],
              },
            }
          : {
              messaging_product: 'whatsapp',
              to: recipient,
              type: 'text',
              text: { body: message, preview_url: false },
            };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(
            `https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(phoneNumberId as string)}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            }
          );
          if (!response.ok) {
            // لا نسجل نص الاستجابة كي لا تتسرب بيانات اعتماد أو بيانات عميل إلى السجلات.
            this.logger.warn(`WhatsApp delivery failed with HTTP ${response.status}`);
            return 'failed';
          }
          return 'sent';
        } catch (error) {
          this.logger.warn(`WhatsApp delivery failed: ${this.safeError(error)}`);
          return 'failed';
        } finally {
          clearTimeout(timeout);
        }
      })
    );
    if (results.includes('failed')) return 'failed';
    return results.includes('sent') ? 'sent' : 'skipped';
  }

  private safeError(error: unknown): string {
    if (error instanceof Error) return error.name === 'AbortError' ? 'timeout' : error.name;
    return 'unknown error';
  }
}
