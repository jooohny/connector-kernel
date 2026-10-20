import { EXCEPTION_CODE_BLOCK } from '../../constants/exception-code.constants';
import { AbstractException } from '../abstracts/abstract.exception';

export class InternalApplicationException extends AbstractException {
  public static readonly TechnicalName = 'EXCEPTION::INTERNAL_APPLICATION';
  public static readonly CodeBlock = EXCEPTION_CODE_BLOCK.INTERNAL_APPLICATION;

  public readonly technicalName = InternalApplicationException.TechnicalName;
  public readonly code = EXCEPTION_CODE_BLOCK.INTERNAL_APPLICATION.min;

  public constructor(message: string) {
    super(message);
  }
}
