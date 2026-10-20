import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { FetchHttpClient } from '../../../src/modules/payments/infrastructure/connectors/fetch-http-client';
import type { HttpRequest } from '../../../src/modules/payments/infrastructure/connectors/http-client';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

async function listen(handler: Handler): Promise<Server> {
  const server = createServer(handler);

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function urlOf(server: Server): string {
  const { port } = server.address() as AddressInfo;

  return `http://127.0.0.1:${port}/v2/orders`;
}

function request(url: string, timeoutMs = 1_000): HttpRequest {
  return {
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: '{"merchant_ref":"m-1"}',
    timeoutMs,
  };
}

describe('FetchHttpClient', () => {
  const client = new FetchHttpClient();
  let server: Server | null = null;

  afterEach(async () => {
    if (server !== null) {
      await close(server);
      server = null;
    }
  });

  it('returns status and the body text', async () => {
    let received = '';
    server = await listen((incoming, response) => {
      incoming.on('data', (chunk: Buffer) => {
        received += chunk.toString();
      });
      incoming.on('end', () => {
        response.writeHead(200, { 'X-Trace': 't-1' }).end('{"code":"00"}');
      });
    });

    const result = await client.send(request(urlOf(server)));

    expect(result).toMatchObject({
      kind: 'response',
      status: 200,
      body: '{"code":"00"}',
    });
    expect(received).toBe('{"merchant_ref":"m-1"}');
  });

  it('returns a 500 as a response, not a missing one', async () => {
    server = await listen((_incoming, response) => {
      response.writeHead(500).end('boom');
    });

    expect(await client.send(request(urlOf(server)))).toMatchObject({
      kind: 'response',
      status: 500,
      body: 'boom',
    });
  });

  it('returns no-response when the provider is slower than timeoutMs', async () => {
    server = await listen(() => {
      // Never answers.
    });

    expect(await client.send(request(urlOf(server), 100))).toEqual({
      kind: 'no-response',
    });
  });

  it('returns no-response when nothing listens', async () => {
    const closed = await listen(() => {});
    const url = urlOf(closed);
    await close(closed);

    expect(await client.send(request(url))).toEqual({
      kind: 'no-response',
    });
  });
});
