/**
 * عرض التواريخ والأوقات بتوقيت التاجر (اللي المدير العام محدده له) — مش توقيت جهاز
 * المستخدم. التوقيت بيتظبط مرة واحدة بعد تسجيل الدخول (AuthContext).
 */

export const DEFAULT_TIMEZONE = 'Africa/Cairo';

let currentTimezone = DEFAULT_TIMEZONE;

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function setTenantTimezone(tz?: string | null) {
  currentTimezone = isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
}

export function getTenantTimezone() {
  return currentTimezone;
}

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** تاريخ ووقت — مثال: ١٣‏/١٠‏/٢٠٢٦، ٣:٢٥ م */
export function formatDateTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
  tz: string = currentTimezone
): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString('ar-EG', { timeZone: tz, ...options });
}

/** تاريخ بس */
export function formatDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
  tz: string = currentTimezone
): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('ar-EG', { timeZone: tz, ...options });
}

/** وقت بس */
export function formatTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
  tz: string = currentTimezone
): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleTimeString('ar-EG', { timeZone: tz, ...options });
}

/** YYYY-MM-DD للحظة معيّنة بتوقيت التاجر (لحقول التاريخ). */
export function dateKey(value: DateInput = new Date(), tz: string = currentTimezone): string {
  const date = toDate(value) || new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** تاريخ النهارده (YYYY-MM-DD) بتوقيت التاجر. */
export function todayKey(): string {
  return dateKey(new Date());
}

/** تاريخ من N يوم (YYYY-MM-DD) بتوقيت التاجر. */
export function daysAgoKey(days: number): string {
  const [y, m, d] = todayKey().split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}
