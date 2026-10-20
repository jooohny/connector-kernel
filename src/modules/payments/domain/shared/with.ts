/** A model with the named optional or nullable fields loaded, e.g. With<Payment, 'attempts'>. */
export type With<T, K extends keyof T> = T & {
  readonly [P in K]-?: NonNullable<T[P]>;
};
