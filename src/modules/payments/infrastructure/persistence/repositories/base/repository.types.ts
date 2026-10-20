import type { QueryFailedError } from 'typeorm';

export interface ConstraintViolationError extends QueryFailedError {
  constraint: string;
}
