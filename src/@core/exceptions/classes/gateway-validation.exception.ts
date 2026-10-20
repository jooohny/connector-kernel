import {
  EXCEPTION_CODE_BLOCK,
  UNKNOWN_EXCEPTION_CODE,
} from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

enum Message {
  REQUIRED_STRING = 'REQUIRED_STRING',
  MUST_BE_ONE_OF = 'MUST_BE_ONE_OF',
  INVALID_FORMAT = 'INVALID_FORMAT',
  TOO_LONG = 'TOO_LONG',
}

const Code: Readonly<Record<Message, number>> = {
  [Message.REQUIRED_STRING]: 2500,
  [Message.MUST_BE_ONE_OF]: 2501,
  [Message.INVALID_FORMAT]: 2502,
  [Message.TOO_LONG]: 2503,
};

const CodeByMessage: Readonly<Record<string, number>> = Code;

export class GatewayValidationException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::GATEWAY_VALIDATION';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.GATEWAY_VALIDATION;

  public static get Message(): typeof Message {
    return Message;
  }

  public static get Code(): typeof Code {
    return Code;
  }

  public readonly technicalName = GatewayValidationException.TechnicalName;
  public readonly code: number;
  public readonly field: string;

  public constructor(message: Message | string, field: string) {
    super(message);

    this.code = CodeByMessage[message] ?? UNKNOWN_EXCEPTION_CODE;
    this.field = field;
  }
}
