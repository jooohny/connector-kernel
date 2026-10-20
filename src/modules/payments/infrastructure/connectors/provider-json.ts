import type { IncomingHttpHeaders } from 'node:http';

/** Parses a provider body; null unless it is a JSON object. Never throws. */
export function readJsonObject(
  text: string,
): Readonly<Record<string, unknown>> | null {
  try {
    const value: unknown = JSON.parse(text);

    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Header names are case-insensitive. */
export function readHeader(
  headers: Readonly<IncomingHttpHeaders>,
  name: string,
): string | null {
  const value = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];

  return Array.isArray(value) ? value.join(', ') : (value ?? null);
}
