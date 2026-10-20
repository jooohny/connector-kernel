import { Injectable } from '@nestjs/common';

import type { HttpClient, HttpRequest, HttpResult } from './http-client';

/** Never throws: a missing response is a result (ADR 0004). */
@Injectable()
export class FetchHttpClient implements HttpClient {
  public async send(request: HttpRequest): Promise<HttpResult> {
    const signal = AbortSignal.timeout(request.timeoutMs);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal,
      });

      return {
        kind: 'response',
        status: response.status,
        body: await response.text(),
      };
    } catch {
      // Node 20 marks fetch Experimental, so error names are not relied on.
      return {
        kind: 'no-response',
      };
    }
  }
}
