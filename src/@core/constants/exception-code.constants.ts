export const UNKNOWN_EXCEPTION_CODE = 0;

export type ExceptionCodeBlock = {
  readonly min: number;
  readonly max: number;
};

export const EXCEPTION_CODE_BLOCK = {
  DATABASE: { min: 1000, max: 1499 },
  VALIDATION: { min: 2000, max: 2499 },
  GATEWAY_VALIDATION: { min: 2500, max: 2999 },
  AUTH: { min: 3000, max: 3499 },
  NOT_FOUND: { min: 4000, max: 4499 },
  SERVICE_UNAVAILABLE: { min: 5000, max: 5999 },
  INTERNAL_APPLICATION: { min: 6000, max: 6499 },
  CONFIGURATION: { min: 7000, max: 7499 },
  CONFLICT: { min: 9000, max: 9499 },
} as const satisfies Record<string, ExceptionCodeBlock>;
