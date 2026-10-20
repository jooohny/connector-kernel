import type { ValidationError } from 'class-validator';

import { GatewayValidationException } from '../classes/gateway-validation.exception';

export function exceptionFactory(
  validationErrors: ValidationError[] = [],
): GatewayValidationException {
  const error = findOriginatingError(validationErrors[0]);

  if (error === undefined) {
    return new GatewayValidationException(
      GatewayValidationException.Message.INVALID_FORMAT,
      'body',
    );
  }

  const constraints = error.constraints;
  const message = constraints
    ? constraints[Object.keys(constraints)[0]]
    : GatewayValidationException.Message.INVALID_FORMAT;

  return new GatewayValidationException(message, error.property ?? 'body');
}

function findOriginatingError(
  validationError: ValidationError | undefined,
): ValidationError | undefined {
  if (!validationError?.children?.[0]) {
    return validationError;
  }

  return findOriginatingError(validationError.children[0]);
}
