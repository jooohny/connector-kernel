import {
  EXCEPTION_CODE_BLOCK,
  UNKNOWN_EXCEPTION_CODE,
} from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

enum Message {
  QUERIED_ROWS_ARE_LOCKED = 'QUERIED_ROWS_ARE_LOCKED',
  UNEXPECTED_RESULT = 'UNEXPECTED_RESULT',
  UNEXPECTED_EMPTY_RESULT = 'UNEXPECTED_EMPTY_RESULT',
  PAYMENT_LOCK_REQUIRED = 'PAYMENT_LOCK_REQUIRED',
  ROW_CHANGED_OUTSIDE_LOCK = 'ROW_CHANGED_OUTSIDE_LOCK',
  ROW_NOT_IN_LOCKED_PAYMENT = 'ROW_NOT_IN_LOCKED_PAYMENT',
  OPEN_ATTEMPT_EXISTS = 'OPEN_ATTEMPT_EXISTS',
  EVENT_WITHOUT_ATTEMPT = 'EVENT_WITHOUT_ATTEMPT',
}

const Code: Readonly<Record<Message, number>> = {
  [Message.QUERIED_ROWS_ARE_LOCKED]: 1000,
  [Message.UNEXPECTED_RESULT]: 1001,
  [Message.UNEXPECTED_EMPTY_RESULT]: 1002,
  [Message.PAYMENT_LOCK_REQUIRED]: 1003,
  [Message.ROW_CHANGED_OUTSIDE_LOCK]: 1004,
  [Message.ROW_NOT_IN_LOCKED_PAYMENT]: 1005,
  [Message.OPEN_ATTEMPT_EXISTS]: 1006,
  [Message.EVENT_WITHOUT_ATTEMPT]: 1007,
};

export class DatabaseException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::DATABASE';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.DATABASE;

  public static get Message(): typeof Message {
    return Message;
  }

  public static get Code(): typeof Code {
    return Code;
  }

  public readonly technicalName = DatabaseException.TechnicalName;
  public readonly code: number;

  public constructor(message: Message) {
    super(message);

    this.code = Code[message] ?? UNKNOWN_EXCEPTION_CODE;
  }
}
