import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export interface OperationalAlert {
  event: string;
  title: string;
  details: Record<string, unknown>;
}

type ChannelResult = 'sent' | 'skipped' | 'failed';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private mailTransport?: Transporter;

  constructor(private readonly config: ConfigService) {}

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
    recipients?: { email?: string; whatsapp?: string }
  ): Promise<{ email: ChannelResult; whatsapp: ChannelResult }> {
    const message = this.formatMessage(alert);
    const emailRecipients = Array.from(
      new Set(
        [
          this.config.get<string>('NOTIFICATION_EMAIL_TO') || 'blinkbusinessdevelopment@gmail.com',
          recipients?.email,
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      )
    );
    const whatsappRecipients = Array.from(
      new Set(
        [this.config.get<string>('WHATSAPP_TO') || '+201024898091', recipients?.whatsapp]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      )
    );
    const [email, whatsapp] = await Promise.all([
      this.sendEmail(alert.title, message, emailRecipients),
      this.sendWhatsApp(message, whatsappRecipients),
    ]);
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

  private formatMessage(alert: OperationalAlert): string {
    const details = Object.entries(alert.details)
      .map(([key, value]) => {
        const printable = typeof value === 'string' ? value : JSON.stringify(value);
        return `${key}: ${printable ?? '-'}`;
      })
      .join('\n');
    const message = `Blink ERP\n${alert.title}\nالحدث: ${alert.event}\n${details}\nالوقت: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
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
