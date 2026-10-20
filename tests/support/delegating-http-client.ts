import type {
  HttpClient,
  HttpRequest,
  HttpResult,
} from '../../src/modules/payments/infrastructure/connectors/http-client';
import { ScriptedHttpClient } from './scripted-http-client';

/** Bound once into the app; each test points it at its own scripted transport. */
export class DelegatingHttpClient implements HttpClient {
  private target: HttpClient = new ScriptedHttpClient([]);

  public use<T extends HttpClient>(target: T): T {
    this.target = target;

    return target;
  }

  public async send(request: HttpRequest): Promise<HttpResult> {
    return this.target.send(request);
  }
}
