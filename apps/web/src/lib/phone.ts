/**
 * تحويل رقم موبايل محلي (01012345678) لصيغة دولية (201012345678) عشان روابط واتساب.
 * نفس منطق الباك إند (apps/api/src/common/utils/phone.ts).
 */

const CALLING_CODE_BY_TIMEZONE: Record<string, string> = {
  'Africa/Cairo': '20',
  'Asia/Riyadh': '966',
  'Asia/Dubai': '971',
  'Asia/Kuwait': '965',
  'Asia/Qatar': '974',
  'Asia/Bahrain': '973',
  'Asia/Muscat': '968',
  'Asia/Amman': '962',
  'Asia/Baghdad': '964',
  'Africa/Tripoli': '218',
  'Africa/Casablanca': '212',
  'Europe/Istanbul': '90',
};

const CALLING_CODE_BY_COUNTRY: Array<[RegExp, string]> = [
  [/egypt|مصر/i, '20'],
  [/saudi|السعودية/i, '966'],
  [/emirates|uae|الإمارات|الامارات/i, '971'],
  [/kuwait|الكويت/i, '965'],
  [/qatar|قطر/i, '974'],
  [/bahrain|البحرين/i, '973'],
  [/oman|عمان|عُمان/i, '968'],
  [/jordan|الأردن|الاردن/i, '962'],
  [/iraq|العراق/i, '964'],
  [/libya|ليبيا/i, '218'],
  [/morocco|المغرب/i, '212'],
  [/turkey|türkiye|تركيا/i, '90'],
];

export function callingCodeFor(timezone?: string | null, country?: string | null): string {
  if (timezone && CALLING_CODE_BY_TIMEZONE[timezone]) return CALLING_CODE_BY_TIMEZONE[timezone];
  if (country) {
    const match = CALLING_CODE_BY_COUNTRY.find(([pattern]) => pattern.test(country));
    if (match) return match[1];
  }
  return '20';
}

/** الرقم بصيغة دولية (أرقام بس) أو null لو مش رقم صالح. */
export function toInternationalPhone(
  raw: string | null | undefined,
  callingCode: string
): string | null {
  if (!raw) return null;
  // أرقام عربية/فارسية → إنجليزي
  const western = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
  const hasPlus = western.startsWith('+');
  let digits = western.replace(/\D/g, '');
  if (!digits) return null;
  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith(callingCode) && digits.length >= callingCode.length + 8) {
    // already international
  } else if (digits.startsWith('0')) digits = callingCode + digits.replace(/^0+/, '');
  else if (digits.length <= 10) digits = callingCode + digits;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}
