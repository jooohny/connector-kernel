/**
 * A clock that starts at `start` (tests pass any time) and then runs at wall-clock pace,
 * so work done after a slow provider call sees the time it really ran at.
 */
export function clockFrom(start: Date): () => Date {
  const offsetMs = start.getTime() - Date.now();

  return (): Date => new Date(Date.now() + offsetMs);
}
