import {
  FailureCause,
  ProviderStatus,
} from '../../../domain/shared/payment-enums';

export const BRAVO_BICS: ReadonlyMap<string, string> = new Map([
  ['ID-BCA', 'CENAIDJA'],
  ['ID-MANDIRI', 'BMRIIDJA'],
]);

// Confirmed failure only; a miss defaults to PROVIDER (ADR 0004).
export const BRAVO_FAILURE_CAUSES: ReadonlyMap<string, FailureCause> = new Map([
  ['ACCOUNT_CLOSED', FailureCause.CLIENT],
  ['INVALID_ACCOUNT', FailureCause.CLIENT],
  ['BANK_UNAVAILABLE', FailureCause.PROVIDER],
  ['SYSTEM_BUSY', FailureCause.PROVIDER],
  ['LIMIT_EXCEEDED', FailureCause.PROVIDER],
]);

export const BRAVO_EVENT_TYPES: ReadonlyMap<string, ProviderStatus> = new Map([
  ['payout.completed', ProviderStatus.SUCCEEDED],
  ['payout.failed', ProviderStatus.FAILED],
  ['payout.returned', ProviderStatus.RETURNED],
]);

export const BRAVO_MAX_SIGNATURE_AGE_MS = 5 * 60_000;
