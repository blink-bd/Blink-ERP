/**
 * توقيت التاجر.
 *
 * كل التواريخ في قاعدة البيانات متخزنة `timestamp` (من غير منطقة زمنية) بتوقيت UTC
 * (السيرفر شغال UTC — main.ts بيفرض TZ=UTC). التاجر بيشتغل بالتوقيت اللي المدير العام
 * محدده له في `tenants.timezone` (الافتراضي القاهرة)، فـ«اليوم» و«من تاريخ/إلى تاريخ»
 * لازم يتحسبوا بتوقيته ثم يتحولوا UTC قبل المقارنة بالأعمدة.
 */

export const DEFAULT_TENANT_TIMEZONE = 'Africa/Cairo';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const CACHE_TTL_MS = 60_000;
const tzCache = new Map<string, { tz: string; expiresAt: number }>();

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTimezone(tz?: string | null): string {
  return isValidTimezone(tz) ? tz : DEFAULT_TENANT_TIMEZONE;
}

interface Queryable {
  query: (sql: string, params?: any[]) => Promise<any>;
}

/** توقيت التاجر (مع كاش دقيقة عشان ما نسألش القاعدة في كل طلب). */
export async function getTenantTimezone(db: Queryable, tenantId?: string | null): Promise<string> {
  if (!tenantId) return DEFAULT_TENANT_TIMEZONE;
  const cached = tzCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.tz;
  const rows = await db.query(`SELECT timezone FROM tenants WHERE id = $1`, [tenantId]);
  const tz = safeTimezone(rows?.[0]?.timezone);
  tzCache.set(tenantId, { tz, expiresAt: Date.now() + CACHE_TTL_MS });
  return tz;
}

/** لما المدير العام يغيّر توقيت التاجر. */
export function invalidateTenantTimezone(tenantId: string) {
  tzCache.delete(tenantId);
}

/** فرق التوقيت (بالمللي ثانية) بين المنطقة الزمنية و UTC في لحظة معيّنة. */
function offsetMs(tz: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return asUtc - (instant - (instant % 1000));
}

/** لحظة UTC المقابلة لوقت «حائط» بتوقيت التاجر. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  tz: string,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Date {
  const zone = safeTimezone(tz);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  let result = guess - offsetMs(zone, guess);
  // تصحيح لو التوقيت الصيفي اتغير بين التقدير والنتيجة.
  const second_pass = guess - offsetMs(zone, result);
  if (second_pass !== result) result = second_pass;
  return new Date(result);
}

/** صيغة عمود timestamp (UTC من غير منطقة) — 'YYYY-MM-DD HH:mm:ss.SSS'. */
export function toUtcSql(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

/** بداية يوم (YYYY-MM-DD) بتوقيت التاجر كـ UTC، مع إزاحة أيام اختيارية. */
export function zonedDayStartUtc(dateOnly: string, tz: string, addDays = 0): Date {
  const match = DATE_ONLY.exec(dateOnly);
  if (!match) throw new Error(`Invalid date: ${dateOnly}`);
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  base.setUTCDate(base.getUTCDate() + addDays);
  return zonedWallTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), tz);
}

/** تاريخ اليوم (YYYY-MM-DD) بتوقيت التاجر. */
export function todayInTimezone(tz: string, now: Date = new Date()): string {
  return dateInTimezone(now, tz);
}

/** التاريخ (YYYY-MM-DD) للحظة معيّنة بتوقيت التاجر. */
export function dateInTimezone(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** السنة الحالية بتوقيت التاجر (لترقيم المستندات). */
export function yearInTimezone(tz: string, now: Date = new Date()): number {
  return Number(todayInTimezone(tz, now).slice(0, 4));
}

/** نطاق «النهارده» بتوقيت التاجر: [بداية اليوم، بداية بكرة) كقيم SQL بتوقيت UTC. */
export function todayRangeUtc(tz: string, now: Date = new Date()) {
  const today = todayInTimezone(tz, now);
  return {
    date: today,
    fromTs: toUtcSql(zonedDayStartUtc(today, tz)),
    toExclusiveTs: toUtcSql(zonedDayStartUtc(today, tz, 1)),
  };
}

/**
 * تاريخ من غير وقت (YYYY-MM-DD) جاي من المستخدم (تاريخ مصروف/فاتورة) — بيتخزن الساعة 12
 * الظهر بتوقيت التاجر عشان يفضل في نفس اليوم في كل التقارير. أي قيمة فيها وقت بتتساب زي ما هي.
 */
export function normalizeBusinessDate(
  value: string | Date | undefined | null,
  tz: string
): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) return value;
  const match = DATE_ONLY.exec(value);
  if (match) {
    return zonedWallTimeToUtc(Number(match[1]), Number(match[2]), Number(match[3]), tz, 12);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** تعبير SQL يحوّل عمود timestamp (UTC) لتوقيت التاجر — للتجميع باليوم/الساعة. */
export function sqlLocal(column: string, tzParam: string): string {
  return `(${column} AT TIME ZONE 'UTC' AT TIME ZONE ${tzParam})`;
}

/** السنة الحالية بتوقيت التاجر — لترقيم المستندات (فاتورة 31 ديسمبر بالليل تفضل على سنتها). */
export async function tenantYear(db: Queryable, tenantId: string): Promise<number> {
  return yearInTimezone(await getTenantTimezone(db, tenantId));
}
