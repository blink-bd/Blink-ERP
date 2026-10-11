/**
 * فحص متغيرات البيئة الحساسة عند تشغيل الخادم. لو فيه إعداد خطير (سر ضعيف،
 * سر مكرر، قيمة المثال الافتراضية) الخادم يرفض يشتغل بدل ما يشتغل وهو مكشوف.
 */
const PLACEHOLDER_PATTERNS = [/change-?me/i, /your-very-long/i, /example/i, /^secret$/i];

export function validateSecurityEnv(env: NodeJS.ProcessEnv = process.env): void {
  const isProd = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  const secrets: Record<string, string | undefined> = {
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
    JWT_MASTER_SECRET: env.JWT_MASTER_SECRET,
  };

  for (const [name, value] of Object.entries(secrets)) {
    if (!value) {
      errors.push(`${name} غير مضبوط`);
      continue;
    }
    if (value.length < 32) errors.push(`${name} لازم يكون 32 حرف على الأقل`);
    if (isProd && PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
      errors.push(`${name} لسه بقيمة المثال الافتراضية — غيّره لقيمة عشوائية`);
    }
  }

  const values = Object.values(secrets).filter(Boolean);
  if (new Set(values).size !== values.length) {
    errors.push('JWT_ACCESS_SECRET و JWT_REFRESH_SECRET و JWT_MASTER_SECRET لازم يكونوا مختلفين');
  }

  if (!env.DATABASE_URL) errors.push('DATABASE_URL غير مضبوط');
  if (isProd && !env.FRONTEND_URL) {
    errors.push('FRONTEND_URL مطلوب في الإنتاج (لتقييد CORS على واجهتك فقط)');
  }
  if (isProd && env.FRONTEND_URL && /\*/.test(env.FRONTEND_URL)) {
    errors.push('FRONTEND_URL لا يجب أن يحتوي على * في الإنتاج');
  }
  if (isProd && !env.MASTER_ADMIN_ALLOWED_IPS) {
    warnings.push(
      'MASTER_ADMIN_ALLOWED_IPS غير مضبوط: لوحة المدير العام متاحة من أي IP (فعّل المصادقة الثنائية على الأقل)'
    );
  }

  for (const w of warnings) console.warn(`⚠️  ${w}`);
  if (errors.length) {
    const message = `❌ إعدادات أمان غير صالحة:\n - ${errors.join('\n - ')}`;
    if (isProd) throw new Error(message);
    console.warn(message);
  }
}

/** FRONTEND_URL ممكن يحتوي أكثر من رابط مفصولين بفاصلة. */
export function parseAllowedOrigins(raw?: string): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
