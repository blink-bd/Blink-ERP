import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  CHANNELS_SETTINGS_KEY,
  ChannelSecrets,
  StoredChannels,
  decryptChannelSecrets,
  encryptChannelSecrets,
  resolveChannels,
} from '@/modules/notifications/notification-channels';
import { UpdateChannelsDto } from './dto/channels.dto';

/** إعداد قنوات الإرسال (إيميل وواتساب) للمنصة كلها من لوحة المدير العام. */
@Injectable()
export class PlatformChannelsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService
  ) {}

  private get getter() {
    return (key: string) => this.config.get<string>(key);
  }

  private async load(): Promise<{
    stored: StoredChannels | null;
    secrets: ChannelSecrets;
    updatedAt?: Date;
    updatedBy?: string;
  }> {
    const [row] = await this.dataSource.query(
      `SELECT value, secrets, updated_at AS "updatedAt", updated_by AS "updatedBy"
       FROM platform_settings WHERE key = $1`,
      [CHANNELS_SETTINGS_KEY]
    );
    return {
      stored: row?.value || null,
      secrets: decryptChannelSecrets(row?.secrets, this.getter),
      updatedAt: row?.updatedAt,
      updatedBy: row?.updatedBy,
    };
  }

  /** الإعدادات من غير أي أسرار (بيرجع بس هل السر محفوظ ولا لأ). */
  async get() {
    const { stored, secrets, updatedAt, updatedBy } = await this.load();
    const effective = resolveChannels(stored, secrets, this.getter);
    return {
      email: {
        provider: stored?.email?.provider || (effective.source === 'env' && effective.email.configured ? 'smtp' : 'none'),
        fromEmail: stored?.email?.fromEmail || '',
        fromName: stored?.email?.fromName || 'Blink ERP',
        smtpHost: stored?.email?.smtpHost || '',
        smtpPort: stored?.email?.smtpPort || 587,
        smtpSecure: Boolean(stored?.email?.smtpSecure),
        smtpUser: stored?.email?.smtpUser || '',
        hasSmtpPassword: Boolean(secrets.smtpPassword),
        hasApiKey: Boolean(secrets.emailApiKey),
        configured: effective.email.configured,
      },
      whatsapp: {
        enabled: stored?.whatsapp?.enabled !== false,
        phoneNumberId: stored?.whatsapp?.phoneNumberId || '',
        apiVersion: stored?.whatsapp?.apiVersion || 'v23.0',
        templateName: stored?.whatsapp?.templateName || '',
        templateLanguage: stored?.whatsapp?.templateLanguage || 'ar',
        hasAccessToken: Boolean(secrets.whatsappToken),
        configured: effective.whatsapp.configured,
      },
      operator: {
        email: stored?.operator?.email || effective.operator.email,
        whatsapp: stored?.operator?.whatsapp || effective.operator.whatsapp,
      },
      source: effective.source,
      updatedAt: updatedAt || null,
      updatedBy: updatedBy || null,
    };
  }

  async update(dto: UpdateChannelsDto, adminEmail: string) {
    const current = await this.load();
    const stored: StoredChannels = { ...(current.stored || {}) };
    const secrets: ChannelSecrets = { ...current.secrets };

    if (dto.email) {
      const e = dto.email;
      stored.email = {
        provider: e.provider,
        fromEmail: e.fromEmail?.trim() || null,
        fromName: e.fromName?.trim() || 'Blink ERP',
        smtpHost: e.smtpHost?.trim() || null,
        smtpPort: e.smtpPort || 587,
        smtpSecure: Boolean(e.smtpSecure),
        smtpUser: e.smtpUser?.trim() || null,
      };
      if (e.smtpPassword) secrets.smtpPassword = e.smtpPassword;
      if (e.apiKey) secrets.emailApiKey = e.apiKey.trim();
      if ((e.provider === 'brevo' || e.provider === 'resend') && !stored.email.fromEmail) {
        throw new BadRequestException('اكتب إيميل المرسل (لازم يكون متوثق عند المزود)');
      }
      if (e.provider === 'smtp' && (!stored.email.smtpHost || !stored.email.smtpUser)) {
        throw new BadRequestException('اكتب عنوان سيرفر SMTP واسم المستخدم');
      }
    }
    if (dto.whatsapp) {
      const w = dto.whatsapp;
      stored.whatsapp = {
        enabled: w.enabled !== false,
        phoneNumberId: w.phoneNumberId?.trim() || null,
        apiVersion: w.apiVersion?.trim() || 'v23.0',
        templateName: w.templateName?.trim() || null,
        templateLanguage: w.templateLanguage?.trim() || 'ar',
      };
      if (w.accessToken) secrets.whatsappToken = w.accessToken.trim();
    }
    if (dto.operator) {
      stored.operator = {
        email: dto.operator.email?.trim().toLowerCase() || null,
        whatsapp: dto.operator.whatsapp?.trim() || null,
      };
    }
    for (const key of dto.clearSecrets || []) {
      if (key === 'smtpPassword' || key === 'emailApiKey' || key === 'whatsappToken') {
        delete secrets[key];
      }
    }

    await this.dataSource.query(
      `INSERT INTO platform_settings (key, value, secrets, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, secrets = EXCLUDED.secrets,
             updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
      [
        CHANNELS_SETTINGS_KEY,
        JSON.stringify(stored),
        encryptChannelSecrets(secrets, this.getter),
        adminEmail,
      ]
    );
    this.notifications.invalidateChannels();
    return this.get();
  }

  /** رسالة تجريبية بالإعدادات المحفوظة، وبيرجع سبب الفشل بالظبط لو حصل. */
  async test(target: { email?: string; whatsapp?: string }) {
    this.notifications.invalidateChannels();
    const channels = await this.notifications.getChannels();
    const email = (target.email || channels.operator.email).trim();
    const whatsapp = (target.whatsapp || channels.operator.whatsapp).trim();
    const text = [
      'Blink ERP',
      'رسالة تجريبية من لوحة المدير العام ✅',
      'لو وصلتك الرسالة دي يبقى قناة الإرسال شغالة وتنبيهات التجار هتوصل.',
      `الوقت: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`,
    ].join('\n');
    const [emailResult, whatsappResult] = await Promise.all([
      this.notifications.deliverEmail('رسالة تجريبية', text, [email], channels),
      this.notifications.deliverWhatsApp(text, [whatsapp], channels),
    ]);
    return {
      email: { ...emailResult, to: email },
      whatsapp: { ...whatsappResult, to: whatsapp },
    };
  }
}
