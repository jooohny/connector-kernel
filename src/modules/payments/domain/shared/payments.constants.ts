export const LIFETIME_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 3;
export const PROVIDER_TIMEOUT_MS = 30_000;
export const WORK_BATCH_SIZE = 50;
/** A confirmed failure that carried neither message nor code still declines with a reason. */
export const UNSPECIFIED_DECLINE_REASON =
  'Declined by the provider without a reason';

/** Minor-unit digits of an amount in our API, per currency. */
export const CURRENCY_EXPONENTS: ReadonlyMap<string, number> = new Map([
  ['IDR', 2],
]);
