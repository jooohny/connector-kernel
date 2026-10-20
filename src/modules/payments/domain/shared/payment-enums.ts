export enum PaymentType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}

export enum PaymentMethod {
  QR = 'qr',
  BANK_TRANSFER = 'bank_transfer',
}

export enum PaymentStatus {
  PROCESSING = 'processing',
  SUCCESS = 'success',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

export enum AttemptStatus {
  UNKNOWN = 'UNKNOWN',
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum FailureCause {
  PROVIDER = 'PROVIDER',
  CLIENT = 'CLIENT',
}

export enum ConnectorName {
  ALPHA = 'alpha',
  BRAVO = 'bravo',
}

export enum SignatureStatus {
  VALID = 'VALID',
  INVALID = 'INVALID',
  STALE = 'STALE',
  UNKNOWN_CONNECTOR = 'UNKNOWN_CONNECTOR',
}

export enum ProviderStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  RETURNED = 'RETURNED',
}

export enum EventResult {
  APPLIED = 'APPLIED',
  IGNORED = 'IGNORED',
  SENT_TO_REVIEW = 'SENT_TO_REVIEW',
}

export enum ReviewReason {
  LIFETIME_ENDED_UNRESOLVED = 'LIFETIME_ENDED_UNRESOLVED',
  UNCONFIRMED_REJECT = 'UNCONFIRMED_REJECT',
  SUCCEEDED_THEN_FAILED = 'SUCCEEDED_THEN_FAILED',
  FAILED_THEN_SUCCEEDED = 'FAILED_THEN_SUCCEEDED',
  UNRECOGNISED_EVENT = 'UNRECOGNISED_EVENT',
  FUNDS_RETURNED = 'FUNDS_RETURNED',
  UNMATCHED_EVENT = 'UNMATCHED_EVENT',
}

export enum ResolvedBy {
  SYSTEM = 'SYSTEM',
  OPERATOR = 'OPERATOR',
}
