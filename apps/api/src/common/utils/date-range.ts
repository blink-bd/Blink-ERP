export function normalizeInclusiveDateRange(startDate?: string, endDate?: string) {
  const expandDateOnly = (value: string | undefined, endOfDay: boolean) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`;
  };

  return {
    startDate: expandDateOnly(startDate, false),
    endDate: expandDateOnly(endDate, true),
  };
}
