/**
 * Requires `useDefineForClassFields: false`. With it on (the default at target
 * ES2023) subclass fields are re-declared after `super()` and overwrite this
 * `Object.assign` with `undefined` — every response serialises to `{}`, silently.
 */
export class BaseResponseDto<T> {
  public constructor(rawObject: Partial<T>) {
    Object.assign(this, rawObject);
  }
}
