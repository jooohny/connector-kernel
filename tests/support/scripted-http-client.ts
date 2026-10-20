import type {
  HttpClient,
  HttpRequest,
  HttpResult,
} from '../../src/modules/payments/infrastructure/connectors/http-client';

export class ScriptedHttpClient implements HttpClient {
  public readonly requests: HttpRequest[] = [];
  private readonly results: HttpResult[];

  public constructor(results: HttpResult[]) {
    this.results = [...results];
  }

  public async send(request: HttpRequest): Promise<HttpResult> {
    this.requests.push(request);
    const result = this.results.shift();

    if (result === undefined) {
      throw new Error('ScriptedHttpClient: unexpected request ' + request.url);
    }

    return Promise.resolve(result);
  }
}

export function jsonResponse(status: number, body: unknown): HttpResult {
  return { kind: 'response', status, body: JSON.stringify(body) };
}

export function timeout(): HttpResult {
  return { kind: 'no-response' };
}
