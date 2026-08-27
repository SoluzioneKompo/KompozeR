/**
 * Coverage for the retrying JSON request helper, against a real local
 * HTTP server so retry/backoff behavior is verified end-to-end.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { URL } from 'url';
import { HttpRequestFailure, requestJson } from '../../../src/adapters/httpClient/httpRetry';

function startServer(handler: http.RequestListener): Promise<{ url: URL; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: new URL(`http://127.0.0.1:${port}/`),
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe('requestJson', () => {
  it('succeeds on the first attempt when the server responds 200', async () => {
    let callCount = 0;
    const { url, close } = await startServer((_req, res) => {
      callCount += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const result = await requestJson<{ ok: boolean }>(url, { method: 'GET', timeoutMs: 1000 });
      expect(result).toEqual({ ok: true });
      expect(callCount).toBe(1);
    } finally {
      await close();
    }
  });

  it('retries on 5xx and succeeds once the server recovers', async () => {
    let callCount = 0;
    const { url, close } = await startServer((_req, res) => {
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
      const result = await requestJson<{ ok: boolean }>(url, { method: 'GET', timeoutMs: 1000 });
      expect(result).toEqual({ ok: true });
      expect(callCount).toBe(3);
    } finally {
      await close();
    }
  });

  it('gives up after `attempts` and throws an http-kind failure carrying the last status', async () => {
    let callCount = 0;
    const { url, close } = await startServer((_req, res) => {
      callCount += 1;
      res.writeHead(503);
      res.end();
    });

    try {
      await expect(requestJson(url, { method: 'GET', timeoutMs: 1000 })).rejects.toMatchObject({
        kind: 'http',
        status: 503,
      });
      expect(callCount).toBe(3);
    } finally {
      await close();
    }
  });

  it('does not retry a 4xx response', async () => {
    let callCount = 0;
    const { url, close } = await startServer((_req, res) => {
      callCount += 1;
      res.writeHead(404);
      res.end();
    });

    try {
      await expect(requestJson(url, { method: 'GET', timeoutMs: 1000 })).rejects.toMatchObject({
        kind: 'http',
        status: 404,
      });
      expect(callCount).toBe(1);
    } finally {
      await close();
    }
  });

  it('retries a connection-level failure (socket reset) even with retryOnTimeout/retryOn5xx false', async () => {
    let callCount = 0;
    const { url, close } = await startServer((req, res) => {
      callCount += 1;
      if (callCount < 3) {
        req.socket.destroy();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const result = await requestJson<{ ok: boolean }>(url, {
        method: 'POST',
        timeoutMs: 1000,
        retryOnTimeout: false,
        retryOn5xx: false,
      });
      expect(result).toEqual({ ok: true });
      expect(callCount).toBe(3);
    } finally {
      await close();
    }
  });

  it('gives up on a connection failure that never recovers', async () => {
    const deadUrl = new URL('http://127.0.0.1:1/'); // nothing listens on port 1 -> ECONNREFUSED
    await expect(
      requestJson(deadUrl, { method: 'GET', timeoutMs: 500, attempts: 2 }),
    ).rejects.toBeInstanceOf(HttpRequestFailure);
  }, 10000);

  it('respects retryOn5xx:false — fails immediately on the first 5xx', async () => {
    let callCount = 0;
    const { url, close } = await startServer((_req, res) => {
      callCount += 1;
      res.writeHead(500);
      res.end();
    });

    try {
      await expect(
        requestJson(url, { method: 'POST', timeoutMs: 1000, retryOn5xx: false }),
      ).rejects.toMatchObject({ kind: 'http', status: 500 });
      expect(callCount).toBe(1);
    } finally {
      await close();
    }
  });
});
