import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { MasterAdmin } from '@/modules/master-admin/entities/master-admin.entity';

/**
 * ينشئ حساب المدير العام من متغيرات البيئة:
 *   MASTER_ADMIN_EMAIL, MASTER_ADMIN_PASSWORD, MASTER_ADMIN_NAME (اختياري)
 * لو الحساب موجود ما بيتغيّرش، إلا لو MASTER_ADMIN_RESET_PASSWORD=true.
 */
export async function seedMasterAdmin(dataSource: DataSource): Promise<void> {
  const email = (process.env.MASTER_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.MASTER_ADMIN_PASSWORD || '';
  const name = process.env.MASTER_ADMIN_NAME || 'المدير العام';

  if (!email || !password) {
    console.warn(
      '⚠️  MASTER_ADMIN_EMAIL / MASTER_ADMIN_PASSWORD غير مضبوطين — لم يتم إنشاء مدير عام'
    );
    return;
  }
  const strong =
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  if (process.env.NODE_ENV === 'production' && !strong) {
    console.error(
      '❌ MASTER_ADMIN_PASSWORD ضعيفة (لازم 12+ حرف بحروف كبيرة وصغيرة وأرقام ورموز) — تم التخطي'
    );
    return;
  }

  const repo = dataSource.getRepository(MasterAdmin);
  const existing = await repo.findOne({ where: { email } });
  const hash = await argon2.hash(password, { type: argon2.argon2id });

  if (!existing) {
    await repo.save(repo.create({ email, passwordHash: hash, fullName: name }));
    console.log(`✅ Master admin created: ${email}`);
  } else if (process.env.MASTER_ADMIN_RESET_PASSWORD === 'true') {
    existing.passwordHash = hash;
    existing.failedLoginAttempts = 0;
    existing.lockedUntil = null as any;
    existing.sessionVersion = (existing.sessionVersion ?? 0) + 1;
    await repo.save(existing);
    console.log(`✅ Master admin password reset: ${email}`);
  } else {
    console.log(`ℹ️  Master admin already exists: ${email}`);
  }

  // طوارئ: لو فقدت تطبيق المصادقة الثنائية، اضبط MASTER_ADMIN_RESET_2FA=true مرة واحدة ثم أعد النشر
  // (يتطلب وصول للسيرفر نفسه، فمش ممكن لمهاجم من بره يستخدمه). بعدها احذف المتغير فوراً.
  if (existing && process.env.MASTER_ADMIN_RESET_2FA === 'true') {
    existing.totpEnabled = false;
    existing.totpSecret = null;
    existing.totpLastStep = null;
    existing.sessionVersion = (existing.sessionVersion ?? 0) + 1;
    await repo.save(existing);
    console.log(`⚠️  Master admin 2FA reset: ${email} — احذف MASTER_ADMIN_RESET_2FA الآن`);
  }
}
