export interface AlphaConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly webhookSecret: string;
  readonly timeoutMs: number;
}

export interface AlphaCreateBody {
  readonly merchant_ref: string;
  readonly type: 'QR_DEPOSIT' | 'BANK_PAYOUT';
  readonly amount: string;
  readonly currency: string;
  readonly bank_code?: string;
  readonly account_no?: string;
  readonly account_name?: string;
}
