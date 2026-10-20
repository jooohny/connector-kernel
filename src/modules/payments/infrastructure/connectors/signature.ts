import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacSha256(secret: string, data: string | Buffer): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

/** Constant-time compare; false on different lengths (timingSafeEqual would throw). */
export function signatureMatches(expected: Buffer, received: Buffer): boolean {
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
