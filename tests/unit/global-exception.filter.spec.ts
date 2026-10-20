import { GlobalExceptionFilter } from '@core/exception-filters';
import {
  ConfigurationException,
  ConflictException,
  DatabaseException,
  GatewayValidationException,
  NotFoundException,
  ValidationException,
} from '@core/exceptions';

describe('GlobalExceptionFilter.formResponse', () => {
  it('renders a business rejection as the specified 422 body', () => {
    const exception = new ValidationException(
      ValidationException.Message.INVALID_STATE,
    );

    expect(GlobalExceptionFilter.formResponse(exception)).toEqual({
      statusCode: 422,
      body: {
        status: 'rejected',
        reason: ValidationException.Message.INVALID_STATE,
      },
    });
  });

  it('renders a request still in progress as 409 naming the payment to read', () => {
    const exception = new ConflictException(
      ConflictException.Message.REQUEST_IN_PROGRESS,
      'payment-1',
    );

    expect(GlobalExceptionFilter.formResponse(exception)).toEqual({
      statusCode: 409,
      body: {
        statusCode: 409,
        code: 9001,
        reason: ConflictException.Message.REQUEST_IN_PROGRESS,
        resourceId: 'payment-1',
      },
    });
  });

  it('renders a DTO validation failure as 400 naming the field', () => {
    const exception = new GatewayValidationException(
      GatewayValidationException.Message.REQUIRED_STRING,
      'amount',
    );

    expect(GlobalExceptionFilter.formResponse(exception)).toEqual({
      statusCode: 400,
      body: {
        statusCode: 400,
        code: 2500,
        message: GatewayValidationException.Message.REQUIRED_STRING,
        field: 'amount',
      },
    });
  });

  it('renders a missing resource as 404 with its message', () => {
    const exception = new NotFoundException(
      NotFoundException.Message.RESOURCE_NOT_FOUND,
    );

    expect(GlobalExceptionFilter.formResponse(exception)).toEqual({
      statusCode: 404,
      body: {
        statusCode: 404,
        code: 4000,
        message: NotFoundException.Message.RESOURCE_NOT_FOUND,
      },
    });
  });

  it.each([
    [
      'database',
      new DatabaseException(DatabaseException.Message.UNEXPECTED_RESULT),
    ],
    [
      'configuration',
      new ConfigurationException({
        message: ConfigurationException.Message.MISSED_ENV_VALUE,
        description: '"DB_PASSWORD" is not defined',
      }),
    ],
  ])('never leaks a %s fault to the client', (_name, exception) => {
    expect(GlobalExceptionFilter.formResponse(exception)).toEqual({
      statusCode: 500,
      body: { statusCode: 500, message: 'internal server error' },
    });
  });

  it('treats a non-domain throwable as an opaque 500', () => {
    expect(
      GlobalExceptionFilter.formResponse(new Error('connection reset')),
    ).toEqual({
      statusCode: 500,
      body: { statusCode: 500, message: 'internal server error' },
    });
  });
});
