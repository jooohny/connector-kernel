import {
  EXCEPTION_CODE_BLOCK,
  UNKNOWN_EXCEPTION_CODE,
} from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

enum Message {
  INVALID_STATE = 'INVALID_STATE',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  NO_CONNECTOR_SERVES_PAYMENT = 'NO_CONNECTOR_SERVES_PAYMENT',
}

const Code: Readonly<Record<Message, number>> = {
  [Message.INVALID_STATE]: 2000,
  [Message.INVALID_AMOUNT]: 2001,
  [Message.NO_CONNECTOR_SERVES_PAYMENT]: 2002,
};

export class ValidationException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::VALIDATION';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.VALIDATION;

  public static get Message(): typeof Message {
    return Message;
  }

  public static get Code(): typeof Code {
    return Code;
  }

  public readonly technicalName = ValidationException.TechnicalName;
  public readonly code: number;

  public constructor(message: Message) {
    super(message);

    this.code = Code[message] ?? UNKNOWN_EXCEPTION_CODE;
  }
}
