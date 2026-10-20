import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import { AbstractException } from '../exceptions/abstracts/abstract.exception';
import { ConflictException } from '../exceptions/classes/conflict.exception';
import { GatewayValidationException } from '../exceptions/classes/gateway-validation.exception';
import { ValidationException } from '../exceptions/classes/validation.exception';
import { mapExceptionHttpCode } from '../exceptions/helpers/exception.helpers';

import type { ErrorResponse } from './dtos/error-response.dto';

const INTERNAL_ERROR_RESPONSE: ErrorResponse = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  body: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'internal server error',
  },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  public static formResponse(exception: unknown): ErrorResponse {
    if (exception instanceof AbstractException === false) {
      return INTERNAL_ERROR_RESPONSE;
    }

    const statusCode = mapExceptionHttpCode(exception);

    if (exception instanceof ValidationException) {
      return {
        statusCode,
        body: { status: 'rejected', reason: exception.message },
      };
    }

    if (exception instanceof ConflictException) {
      return {
        statusCode,
        body: {
          statusCode,
          code: exception.code,
          reason: exception.message,
          resourceId: exception.resourceId,
        },
      };
    }

    if (exception instanceof GatewayValidationException) {
      return {
        statusCode,
        body: {
          statusCode,
          code: exception.code,
          message: exception.message,
          field: exception.field,
        },
      };
    }

    if (statusCode === INTERNAL_ERROR_RESPONSE.statusCode) {
      return INTERNAL_ERROR_RESPONSE;
    }

    return {
      statusCode,
      body: { statusCode, code: exception.code, message: exception.message },
    };
  }

  public catch(exception: unknown, host: ArgumentsHost): void {
    const { statusCode, body } = GlobalExceptionFilter.formResponse(exception);

    host.switchToHttp().getResponse<Response>().status(statusCode).json(body);
  }
}
