import {
  PROVIDER_TIMEOUT_MS,
  CHECK_OFFSETS_S,
  SweepSchedule,
} from '../../../src/modules/payments/domain';

describe('sweep schedule', () => {
  const schedule = new SweepSchedule();
  const createdAt = new Date('2026-10-18T00:00:00Z');

  it.each([
    [0, 35],
    [35, 60],
    [3600, 3900],
  ])(
    'at age %s seconds chooses the strictly later point %s',
    (age, expected) => {
      const now = new Date(createdAt.getTime() + age * 1000);

      const next = schedule.nextCheckAt(createdAt, now);

      expect(next.getTime()).toBe(createdAt.getTime() + expected * 1000);
    },
  );

  it('schedules the first query after the create timeout', () => {
    const next = schedule.firstCheckAt(createdAt, true);

    expect(next).toEqual(new Date(createdAt.getTime() + 35_000));
    expect(CHECK_OFFSETS_S[0] * 1000).toBeGreaterThan(PROVIDER_TIMEOUT_MS);
  });

  it('does not schedule connectors without status queries', () => {
    expect(schedule.firstCheckAt(createdAt, false)).toBeNull();
  });
});
