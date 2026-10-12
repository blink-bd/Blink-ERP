/**
 * إعداد بيئة اختبارات التكامل (e2e). يعمل قبل تحميل ملفات الاختبار عبر setupFiles،
 * فتكتمل متغيرات البيئة قبل أن يقرأ AppModule الإعدادات.
 *
 * قاعدة البيانات: استخدم قاعدة اختبار/مرحلة تجريبية فقط.
 *   E2E_DATABASE_URL (مفضّل) أو DATABASE_URL
 */
const dbUrl = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || '';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbUrl;
process.env.DB_SSL = process.env.E2E_DB_SSL || 'false';
process.env.PORT = '0';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
process.env.PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'e2e-access-secret-0123456789abcdefghijklmnop';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'e2e-refresh-secret-0123456789abcdefghijklmno';
process.env.JWT_MASTER_SECRET =
  process.env.JWT_MASTER_SECRET || 'e2e-master-secret-0123456789abcdefghijklmnopq';
process.env.MASTER_2FA_ENCRYPTION_KEY =
  process.env.MASTER_2FA_ENCRYPTION_KEY || 'e2e-2fa-key-0123456789abcdefghijklmnopqrst';
process.env.WEBHOOK_ENCRYPTION_KEY =
  process.env.WEBHOOK_ENCRYPTION_KEY || 'e2e-webhook-key-0123456789abcdefghijklmnopqrs';
process.env.BACKUP_ALERT_TOKEN = process.env.BACKUP_ALERT_TOKEN || 'e2e-backup-alert-token';
process.env.REMINDERS_JOB_TOKEN = process.env.REMINDERS_JOB_TOKEN || 'e2e-reminders-job-token';
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT || '100000';
process.env.MASTER_ADMIN_EMAIL = process.env.E2E_MASTER_EMAIL || 'e2e-master@example.test';
process.env.MASTER_ADMIN_PASSWORD = process.env.E2E_MASTER_PASSWORD || 'E2e!Master#2026x';
process.env.MASTER_ADMIN_NAME = process.env.MASTER_ADMIN_NAME || 'المدير العام';
// اختبارات التكامل تشتغل بدون مزودي إرسال حقيقيين: القنوات تُسجَّل كـ skipped.
delete process.env.MAIL_USER;
delete process.env.MAIL_PASSWORD;
delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.WHATSAPP_PHONE_NUMBER_ID;
// لا تُقيّد لوحة المدير العام بعنوان IP في الاختبار (نفس سلوك الإنتاج عند عدم الضبط).
delete process.env.MASTER_ADMIN_ALLOWED_IPS;

export const e2eDatabaseUrl = dbUrl;
export const e2eMasterEmail = process.env.MASTER_ADMIN_EMAIL as string;
export const e2eMasterPassword = process.env.MASTER_ADMIN_PASSWORD as string;
