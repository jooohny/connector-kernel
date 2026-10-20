import {
  EXCEPTION_CODE_BLOCK,
  UNKNOWN_EXCEPTION_CODE,
} from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

enum Message {
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
}

const Code: Readonly<Record<Message, number>> = {
  [Message.INVALID_SIGNATURE]: 3000,
};

export class AuthenticationException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::AUTHENTICATION';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.AUTH;

  public static get Message(): typeof Message {
    return Message;
  }

  public static get Code(): typeof Code {
    return Code;
  }

  public readonly technicalName = AuthenticationException.TechnicalName;
  public readonly code: number;

  public constructor(message: Message) {
    super(message);

    this.code = Code[message] ?? UNKNOWN_EXCEPTION_CODE;
  }
}
