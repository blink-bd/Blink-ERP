import { toUtcSql, zonedDayStartUtc } from './tenant-time';

/**
 * يحوّل فلتر «من تاريخ/إلى تاريخ» لنطاق شامل لليوم كامل.
 * لو اتبعت توقيت التاجر، الأيام بتتحسب بتوقيته وتتحول UTC (زي أعمدة القاعدة).
 */
export function normalizeInclusiveDateRange(startDate?: string, endDate?: string, tz?: string) {
  const expandDateOnly = (value: string | undefined, endOfDay: boolean) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (tz) {
      if (!endOfDay) return toUtcSql(zonedDayStartUtc(value, tz));
      return toUtcSql(new Date(zonedDayStartUtc(value, tz, 1).getTime() - 1));
    }
    return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`;
  };

  return {
    startDate: expandDateOnly(startDate, false),
    endDate: expandDateOnly(endDate, true),
  };
}
