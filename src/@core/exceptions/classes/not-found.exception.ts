import {
  EXCEPTION_CODE_BLOCK,
  UNKNOWN_EXCEPTION_CODE,
} from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

enum Message {
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  UNKNOWN_CONNECTOR = 'UNKNOWN_CONNECTOR',
}

const Code: Readonly<Record<Message, number>> = {
  [Message.RESOURCE_NOT_FOUND]: 4000,
  [Message.UNKNOWN_CONNECTOR]: 4001,
};

export class NotFoundException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::NOT_FOUND';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.NOT_FOUND;

  public static get Message(): typeof Message {
    return Message;
  }

  public static get Code(): typeof Code {
    return Code;
  }

  public readonly technicalName = NotFoundException.TechnicalName;
  public readonly code: number;

  public constructor(message: Message) {
    super(message);

    this.code = Code[message] ?? UNKNOWN_EXCEPTION_CODE;
  }
}
