import { normalizeInclusiveDateRange } from './date-range';

describe('normalizeInclusiveDateRange', () => {
  it('expands date-only bounds to include the full selected days', () => {
    expect(normalizeInclusiveDateRange('2026-10-01', '2026-10-12')).toEqual({
      startDate: '2026-10-01T00:00:00.000',
      endDate: '2026-10-12T23:59:59.999',
    });
  });

  it('preserves timestamps and missing bounds', () => {
    expect(normalizeInclusiveDateRange('2026-10-01T09:30:00', undefined)).toEqual({
      startDate: '2026-10-01T09:30:00',
      endDate: undefined,
    });
  });
});
