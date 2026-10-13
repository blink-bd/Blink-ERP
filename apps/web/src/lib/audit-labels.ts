/** أسماء عربية لأحداث سجل التدقيق (audit_logs.action). أي حدث جديد بيظهر بالكود لو مش موجود هنا. */
import { formatDateTime as formatTenantDateTime } from '@/lib/datetime';
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  TENANT_LOGIN: 'تسجيل دخول',
  TENANT_LOGIN_FAILED: 'محاولة دخول فاشلة',
  TENANT_LOGIN_BLOCKED_LOCKED: 'محاولة دخول لحساب مقفل',
  TENANT_ACCOUNT_LOCKED: 'قفل حساب بعد محاولات فاشلة',
  PASSWORD_CHANGED: 'تغيير كلمة المرور',
  PASSWORD_CHANGE_FAILED: 'فشل تغيير كلمة المرور',
  USER_CREATED: 'إضافة مستخدم',
  USER_UPDATED: 'تعديل مستخدم',
  USER_DELETED: 'حذف مستخدم',
  USER_ROLES_CHANGED: 'تغيير أدوار مستخدم',
  USER_BRANCH_ACCESS_CHANGED: 'تغيير فروع ومخازن مستخدم',
  USER_PASSWORD_RESET: 'إعادة تعيين كلمة مرور مستخدم',
  USER_SESSIONS_REVOKED: 'تسجيل خروج مستخدم من كل الأجهزة',
  ROLE_CREATED: 'إنشاء دور',
  ROLE_UPDATED: 'تعديل دور',
  ROLE_DELETED: 'حذف دور',
  API_KEY_CREATED: 'إنشاء مفتاح API',
  API_KEY_REVOKED: 'إلغاء مفتاح API',
  DATA_IMPORTED: 'استيراد بيانات',
  DATA_EXPORTED: 'تصدير بيانات',
  MASTER_LOGIN: 'دخول المدير العام',
  MASTER_LOGIN_FAILED: 'محاولة دخول فاشلة للإدارة',
  MASTER_ACCOUNT_LOCKED: 'قفل حساب الإدارة',
  MASTER_PASSWORD_CHANGED: 'تغيير كلمة مرور الإدارة',
  MASTER_SESSIONS_REVOKED: 'خروج الإدارة من كل الأجهزة',
  MASTER_2FA_SETUP_STARTED: 'بدء إعداد المصادقة الثنائية',
  MASTER_2FA_ENABLED: 'تفعيل المصادقة الثنائية',
  MASTER_2FA_DISABLED: 'إيقاف المصادقة الثنائية',
  TENANT_CREATED: 'إنشاء تاجر',
  TENANT_UPDATED: 'تعديل بيانات تاجر',
  TENANT_DELETED: 'حذف تاجر',
  TENANT_STATUS_CHANGED: 'تغيير حالة تاجر',
  TENANT_SUBSCRIPTION_UPDATED: 'تعديل اشتراك',
  TENANT_FEATURES_UPDATED: 'تعديل مميزات تاجر',
  TENANT_LIMITS_UPDATED: 'تعديل حدود تاجر',
  TENANT_BRANDING_UPDATED: 'تعديل هوية تاجر',
  TENANT_BACKUP_EXPORTED: 'تنزيل نسخة احتياطية لتاجر',
  TENANT_BACKUP_RESTORED: 'استعادة تاجر من نسخة',
  TENANT_USER_PASSWORD_RESET: 'الإدارة غيّرت كلمة مرور مستخدم',
  TENANT_USER_CREATED: 'الإدارة أضافت مستخدم',
  TENANT_USER_UPDATED: 'الإدارة عدّلت بيانات مستخدم',
  TENANT_USER_DELETED: 'الإدارة حذفت مستخدم',
  TENANT_USER_SESSIONS_REVOKED: 'الإدارة سجّلت خروج مستخدم من كل الأجهزة',
  TENANT_USER_UNLOCKED: 'الإدارة فكّت قفل مستخدم',
  NOTIFICATION_CHANNELS_UPDATED: 'تعديل قنوات الإرسال (إيميل/واتساب)',
};

export const auditLabel = (action: string) => AUDIT_ACTION_LABELS[action] || action;

export const severityClass = (severity?: string) =>
  severity === 'critical'
    ? 'bg-red-100 text-red-800'
    : severity === 'warning'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-100 text-gray-700';

export const formatDateTime = (v?: string | null) =>
  v ? formatTenantDateTime(v, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
