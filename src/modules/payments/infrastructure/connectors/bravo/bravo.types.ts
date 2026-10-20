export interface BravoConfig {
  readonly baseUrl: string;
  readonly webhookSecret: string;
  readonly timeoutMs: number;
}

export interface BravoCreateBody {
  readonly reference: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly beneficiary: {
    readonly bank_bic: string | null;
    readonly account: string | null;
    readonly name: string | null;
  };
}
