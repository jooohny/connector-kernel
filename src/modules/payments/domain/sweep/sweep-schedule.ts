// 35 = PROVIDER_TIMEOUT_MS + 5 s, so a sweep never queries while create may still be in flight.
export const CHECK_OFFSETS_S: readonly number[] = [35, 60, 120, 300, 600];
export const REPEAT_EVERY_S = 300;

const LAST_OFFSET_S = CHECK_OFFSETS_S[CHECK_OFFSETS_S.length - 1];

export class SweepSchedule {
  public nextCheckAt(createdAt: Date, now: Date): Date {
    const ageSeconds = (now.getTime() - createdAt.getTime()) / 1000;
    const nextOffset = CHECK_OFFSETS_S.find((offset) => offset > ageSeconds);

    if (nextOffset !== undefined) {
      return new Date(createdAt.getTime() + nextOffset * 1000);
    }

    const repeats =
      Math.floor((ageSeconds - LAST_OFFSET_S) / REPEAT_EVERY_S) + 1;

    return new Date(
      createdAt.getTime() + (LAST_OFFSET_S + repeats * REPEAT_EVERY_S) * 1000,
    );
  }

  public firstCheckAt(createdAt: Date, hasStatusQuery: boolean): Date | null {
    return hasStatusQuery
      ? new Date(createdAt.getTime() + CHECK_OFFSETS_S[0] * 1000)
      : null;
  }
}
