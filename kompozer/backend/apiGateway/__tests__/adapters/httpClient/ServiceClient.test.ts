/**
 * Coverage for the gateway's axios-based service client retry behavior,
 * against a real local HTTP server.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { createServiceClient } from '../../../src/adapters/httpClient/ServiceClient';

function startServer(handler: http.RequestListener): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe('createServiceClient — retry', () => {
  it('retries on 5xx and succeeds once the downstream service recovers', async () => {
    let callCount = 0;
    const { baseUrl, close } = await startServer((_req, res) => {
      callCount += 1;
      if (callCount < 3) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const client = createServiceClient(baseUrl, {});
      const result = await client.get('/anything');
      expect(result).toEqual({ ok: true });
      expect(callCount).toBe(3);
    } finally {
      await close();
    }
  });

  it('does not retry a 4xx response', async () => {
    let callCount = 0;
    const { baseUrl, close } = await startServer((_req, res) => {
      callCount += 1;
      res.writeHead(404);
      res.end();
    });

    try {
      const client = createServiceClient(baseUrl, {});
      await expect(client.get('/missing')).rejects.toBeDefined();
      expect(callCount).toBe(1);
    } finally {
      await close();
    }
  });

  it('gives up after 3 attempts against a service that never recovers', async () => {
    let callCount = 0;
    const { baseUrl, close } = await startServer((_req, res) => {
      callCount += 1;
      res.writeHead(500);
      res.end();
    });

    try {
      const client = createServiceClient(baseUrl, {});
      await expect(client.get('/down')).rejects.toBeDefined();
      expect(callCount).toBe(3);
    } finally {
      await close();
    }
  });
});
