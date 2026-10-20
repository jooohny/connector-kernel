import {
  EXCEPTION_CODE_BLOCK,
  UNKNOWN_EXCEPTION_CODE,
} from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

enum Message {
  MISSED_ENV_VALUE = 'MISSED_ENV_VALUE',
  WRONG_ENV_VALUE = 'WRONG_ENV_VALUE',
}

const Code: Readonly<Record<Message, number>> = {
  [Message.MISSED_ENV_VALUE]: 7000,
  [Message.WRONG_ENV_VALUE]: 7001,
};

export class ConfigurationException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::CONFIGURATION';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.CONFIGURATION;

  public static get Message(): typeof Message {
    return Message;
  }

  public static get Code(): typeof Code {
    return Code;
  }

  public readonly technicalName = ConfigurationException.TechnicalName;
  public readonly code: number;

  public constructor({
    message,
    description,
  }: {
    message: Message;
    description?: string;
  }) {
    super(description ? `${message}: ${description}` : message);

    this.code = Code[message] ?? UNKNOWN_EXCEPTION_CODE;
  }
}
