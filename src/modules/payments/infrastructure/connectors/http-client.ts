export const HTTP_CLIENT = Symbol('HTTP_CLIENT');

export interface HttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly timeoutMs: number;
}

export type HttpResult =
  | {
      readonly kind: 'response';
      readonly status: number;
      readonly body: string;
    }
  | {
      readonly kind: 'no-response';
    };

export interface HttpClient {
  /**
   * Missing responses are returned, never thrown;
   * connectors map them to UNKNOWN (ADR 0004).
   */
  send(request: HttpRequest): Promise<HttpResult>;
}
