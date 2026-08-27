/**
 * Wiring smoke test: proves HttpCatalogQaProvider actually retries
 * transient failures through the shared httpRetry helper, against a real
 * local HTTP server.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { HttpCatalogQaProvider } from '../../../src/adapters/httpClient/HttpCatalogQaProvider';
import { CatalogLookupError } from '../../../src/domain/entities/errors';

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

describe('HttpCatalogQaProvider — retry', () => {
  it('retries on 5xx and succeeds once catalogService recovers', async () => {
    let callCount = 0;
    const { baseUrl, close } = await startServer((_req, res) => {
      callCount += 1;
      if (callCount < 3) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [] }));
    });

    try {
      const provider = new HttpCatalogQaProvider(baseUrl, 1000);
      const items = await provider.search('shelf');
      expect(items).toEqual([]);
      expect(callCount).toBe(3);
    } finally {
      await close();
    }
  });

  it('gives up and throws CatalogLookupError after 3 attempts', async () => {
    const { baseUrl, close } = await startServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });

    try {
      const provider = new HttpCatalogQaProvider(baseUrl, 1000);
      await expect(provider.search('shelf')).rejects.toBeInstanceOf(CatalogLookupError);
    } finally {
      await close();
    }
  });
});
