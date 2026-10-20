import { HttpStatus } from '@nestjs/common';

import { AbstractException } from '../abstracts/abstract.exception';
import { AuthenticationException } from '../classes/authentication.exception';
import { ConfigurationException } from '../classes/configuration.exception';
import { ConflictException } from '../classes/conflict.exception';
import { DatabaseException } from '../classes/database.exception';
import { GatewayValidationException } from '../classes/gateway-validation.exception';
import { InternalApplicationException } from '../classes/internal-application.exception';
import { NotFoundException } from '../classes/not-found.exception';
import { ServiceUnavailableException } from '../classes/service-unavailable.exception';
import { ValidationException } from '../classes/validation.exception';

export function mapExceptionHttpCode(exception: AbstractException): number {
  switch (exception.technicalName) {
    case GatewayValidationException.TechnicalName: {
      return HttpStatus.BAD_REQUEST;
    }

    case AuthenticationException.TechnicalName: {
      return HttpStatus.UNAUTHORIZED;
    }

    case NotFoundException.TechnicalName: {
      return HttpStatus.NOT_FOUND;
    }

    case ServiceUnavailableException.TechnicalName: {
      return HttpStatus.SERVICE_UNAVAILABLE;
    }

    case ConflictException.TechnicalName: {
      return HttpStatus.CONFLICT;
    }

    case ValidationException.TechnicalName: {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }

    case DatabaseException.TechnicalName:
    case ConfigurationException.TechnicalName:
    case InternalApplicationException.TechnicalName: {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    default: {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
