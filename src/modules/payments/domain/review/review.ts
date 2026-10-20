import type { ResolvedBy, ReviewReason } from '../shared/payment-enums';

export interface Review {
  readonly id: string;
  readonly paymentId: string | null;
  readonly attemptId: string | null;
  readonly providerEventId: string | null;
  readonly reason: ReviewReason;
  readonly raisedAt: Date;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: ResolvedBy | null;
  readonly resolutionNote: string | null;
}
