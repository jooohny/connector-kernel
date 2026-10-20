import {
  EXCEPTION_CODE_BLOCK,
  UNKNOWN_EXCEPTION_CODE,
} from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

enum Message {
  DATABASE_UNAVAILABLE = 'DATABASE_UNAVAILABLE',
}

const Code: Readonly<Record<Message, number>> = {
  [Message.DATABASE_UNAVAILABLE]: 5000,
};

export class ServiceUnavailableException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::SERVICE_UNAVAILABLE';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.SERVICE_UNAVAILABLE;

  public static get Message(): typeof Message {
    return Message;
  }

  public static get Code(): typeof Code {
    return Code;
  }

  public readonly technicalName = ServiceUnavailableException.TechnicalName;
  public readonly code: number;

  public constructor(message: Message) {
    super(message);

    this.code = Code[message] ?? UNKNOWN_EXCEPTION_CODE;
  }
}
