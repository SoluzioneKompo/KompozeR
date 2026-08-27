/**
 * Wiring smoke test: proves HttpCatalogRulesProvider actually retries
 * transient failures through the shared httpRetry helper, against a real
 * local HTTP server.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { HttpCatalogRulesProvider } from '../../../src/adapters/http/HttpCatalogRulesProvider';
import { ResourceConflictError } from '../../../src/domain/entities/errors';

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

describe('HttpCatalogRulesProvider — retry', () => {
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
      const provider = new HttpCatalogRulesProvider(baseUrl, 1000);
      const rules = await provider.getRules('TONDO');
      expect(rules.shelfByWidthMm.size).toBe(0);
      expect(callCount).toBe(3);
    } finally {
      await close();
    }
  });

  it('gives up and throws ResourceConflictError after 3 attempts', async () => {
    const { baseUrl, close } = await startServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });

    try {
      const provider = new HttpCatalogRulesProvider(baseUrl, 1000);
      await expect(provider.getRules('TONDO')).rejects.toBeInstanceOf(ResourceConflictError);
    } finally {
      await close();
    }
  });
});
