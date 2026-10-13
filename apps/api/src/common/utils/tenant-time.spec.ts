import {
  normalizeBusinessDate,
  todayRangeUtc,
  toUtcSql,
  zonedDayStartUtc,
} from './tenant-time';
import { normalizeInclusiveDateRange } from './date-range';
import { callingCodeFor, toInternationalPhone } from './phone';

describe('tenant time helpers', () => {
  it('converts a Cairo business day to its UTC boundaries (summer and winter)', () => {
    // مصر صيفي (UTC+3) في أكتوبر 2026 قبل آخر خميس، وشتوي (UTC+2) في يناير.
    expect(toUtcSql(zonedDayStartUtc('2026-07-15', 'Africa/Cairo'))).toBe(
      '2026-07-14 21:00:00.000'
    );
    expect(toUtcSql(zonedDayStartUtc('2026-01-15', 'Africa/Cairo'))).toBe(
      '2026-01-14 22:00:00.000'
    );
    expect(toUtcSql(zonedDayStartUtc('2026-01-15', 'Asia/Riyadh', 1))).toBe(
      '2026-01-15 21:00:00.000'
    );
    expect(toUtcSql(zonedDayStartUtc('2026-01-15', 'UTC'))).toBe('2026-01-15 00:00:00.000');
  });

  it('computes "today" in the tenant timezone, not the server one', () => {
    // 23:30 UTC يوم 12 = 01:30 (أو 02:30 صيفي) يوم 13 في القاهرة.
    const now = new Date('2026-01-12T23:30:00Z');
    const range = todayRangeUtc('Africa/Cairo', now);
    expect(range.date).toBe('2026-01-13');
    expect(range.fromTs).toBe('2026-01-12 22:00:00.000');
    expect(range.toExclusiveTs).toBe('2026-01-13 22:00:00.000');
    expect(todayRangeUtc('UTC', now).date).toBe('2026-01-12');
  });

  it('stores date-only business dates at local noon', () => {
    expect(normalizeBusinessDate('2026-01-15', 'Africa/Cairo')?.toISOString()).toBe(
      '2026-01-15T10:00:00.000Z'
    );
    expect(normalizeBusinessDate(undefined, 'Africa/Cairo')).toBeUndefined();
  });

  it('expands inclusive date filters using the tenant timezone', () => {
    expect(normalizeInclusiveDateRange('2026-01-01', '2026-01-31', 'Africa/Cairo')).toEqual({
      startDate: '2025-12-31 22:00:00.000',
      endDate: '2026-01-31 21:59:59.999',
    });
  });
});

describe('phone helpers', () => {
  it('normalizes local numbers to international WhatsApp format', () => {
    expect(callingCodeFor('Africa/Cairo')).toBe('20');
    expect(callingCodeFor('UTC', 'Saudi Arabia')).toBe('966');
    expect(toInternationalPhone('01012345678', '20')).toBe('201012345678');
    expect(toInternationalPhone('٠١٠١٢٣٤٥٦٧٨', '20')).toBe('201012345678');
    expect(toInternationalPhone('+20 101 234 5678', '20')).toBe('201012345678');
    expect(toInternationalPhone('00201012345678', '20')).toBe('201012345678');
    expect(toInternationalPhone('201012345678', '20')).toBe('201012345678');
    expect(toInternationalPhone('0501234567', '966')).toBe('966501234567');
    expect(toInternationalPhone('12', '20')).toBeNull();
    expect(toInternationalPhone('', '20')).toBeNull();
  });
});
