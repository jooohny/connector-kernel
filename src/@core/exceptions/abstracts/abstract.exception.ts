export abstract class AbstractException extends Error {
  public abstract readonly technicalName: string;

  public abstract readonly code: number;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
