import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { GatewayValidationException } from '@core/exceptions';

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['idempotency-key'];
    const value = typeof header === 'string' ? header.trim() : '';

    if (value === '') {
      throw new GatewayValidationException(
        GatewayValidationException.Message.REQUIRED_STRING,
        'Idempotency-Key',
      );
    }

    if (value.length > 255) {
      throw new GatewayValidationException(
        GatewayValidationException.Message.TOO_LONG,
        'Idempotency-Key',
      );
    }

    return value;
  },
);
