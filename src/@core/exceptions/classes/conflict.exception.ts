import {
  EXCEPTION_CODE_BLOCK,
  UNKNOWN_EXCEPTION_CODE,
} from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

enum Message {
  PARAMS_MISMATCH = 'PARAMS_MISMATCH',
  REQUEST_IN_PROGRESS = 'REQUEST_IN_PROGRESS',
}

const Code: Readonly<Record<Message, number>> = {
  [Message.PARAMS_MISMATCH]: 9000,
  [Message.REQUEST_IN_PROGRESS]: 9001,
};

export class ConflictException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::CONFLICT';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.CONFLICT;

  public static get Message(): typeof Message {
    return Message;
  }

  public static get Code(): typeof Code {
    return Code;
  }

  public readonly technicalName = ConflictException.TechnicalName;
  public readonly code: number;
  /** The existing resource the client can read instead, when there is one. */
  public readonly resourceId: string | null;

  public constructor(message: Message, resourceId: string | null = null) {
    super(message);

    this.code = Code[message] ?? UNKNOWN_EXCEPTION_CODE;
    this.resourceId = resourceId;
  }
}
