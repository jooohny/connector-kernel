import {
  FailureCause,
  PaymentType,
  ProviderStatus,
} from '../../../domain/shared/payment-enums';

import type { Observation } from '../../../domain/connector/connector.types';

export const ALPHA_BANK_CODES: ReadonlyMap<string, string> = new Map([
  ['ID-BCA', '014'],
  ['ID-MANDIRI', '008'],
  ['ID-JAGO', '542'],
]);

export interface AlphaCreateReject {
  readonly observation: Observation;
  readonly unclearReject: boolean;
}

// ADR 0004: only account validation is a clear reject; withdrawal is no less conservative.
export const ALPHA_CREATE_REJECTS: Readonly<
  Record<PaymentType, ReadonlyMap<string, AlphaCreateReject>>
> = {
  [PaymentType.DEPOSIT]: new Map([
    [
      '14',
      {
        observation: {
          status: ProviderStatus.FAILED,
          cause: FailureCause.CLIENT,
          code: '14',
          message: 'Invalid account',
        },
        unclearReject: false,
      },
    ],
    [
      '51',
      {
        observation: {
          status: null,
          cause: null,
          code: '51',
          message: 'Merchant limit exceeded',
        },
        unclearReject: true,
      },
    ],
    [
      '91',
      {
        observation: {
          status: null,
          cause: null,
          code: '91',
          message: 'Issuer or switch inoperative',
        },
        unclearReject: true,
      },
    ],
    [
      '96',
      {
        observation: {
          status: null,
          cause: null,
          code: '96',
          message: 'System malfunction',
        },
        unclearReject: true,
      },
    ],
  ]),
  [PaymentType.WITHDRAWAL]: new Map([
    [
      '14',
      {
        observation: {
          status: ProviderStatus.FAILED,
          cause: FailureCause.CLIENT,
          code: '14',
          message: 'Invalid account',
        },
        unclearReject: false,
      },
    ],
    [
      '51',
      {
        observation: {
          status: null,
          cause: null,
          code: '51',
          message: 'Merchant limit exceeded',
        },
        unclearReject: true,
      },
    ],
    [
      '91',
      {
        observation: {
          status: null,
          cause: null,
          code: '91',
          message: 'Issuer or switch inoperative',
        },
        unclearReject: true,
      },
    ],
    [
      '96',
      {
        observation: {
          status: null,
          cause: null,
          code: '96',
          message: 'System malfunction',
        },
        unclearReject: true,
      },
    ],
  ]),
};

// ADR 0004: a confirmed failure with an unknown code defaults to PROVIDER.
export const ALPHA_FAILURE_CAUSES: ReadonlyMap<string, FailureCause> = new Map([
  ['14', FailureCause.CLIENT],
  ['51', FailureCause.PROVIDER],
  ['91', FailureCause.PROVIDER],
  ['96', FailureCause.PROVIDER],
]);

export const ALPHA_STATUSES: ReadonlyMap<string, ProviderStatus> = new Map([
  ['PENDING', ProviderStatus.PENDING],
  ['PAID', ProviderStatus.SUCCEEDED],
  ['FAILED', ProviderStatus.FAILED],
  ['EXPIRED', ProviderStatus.EXPIRED],
  ['REFUNDED', ProviderStatus.RETURNED],
]);
