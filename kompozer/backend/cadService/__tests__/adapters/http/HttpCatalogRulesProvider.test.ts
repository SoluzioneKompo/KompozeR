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

describe('HttpCatalogRulesProvider — depth filter', () => {
  function shelfItem(sku: string, widthMm: number, depthMm: number) {
    return {
      sku,
      name: sku,
      price: 100,
      Type: 'RIPIANO',
      dimensions: { widthMm, heightMm: 20, depthMm },
    };
  }

  function footItem(sku: string, heightMm: number, depthMm: number) {
    return {
      sku,
      name: sku,
      price: 100,
      Type: 'PIEDINO',
      dimensions: { widthMm: 0, heightMm, depthMm },
    };
  }

  async function withCatalogServer(items: unknown[], run: (provider: HttpCatalogRulesProvider) => Promise<void>) {
    const { baseUrl, close } = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items }));
    });

    try {
      await run(new HttpCatalogRulesProvider(baseUrl, 1000));
    } finally {
      await close();
    }
  }

  it('getRules keeps only shelves matching the requested depth', async () => {
    await withCatalogServer(
      [shelfItem('RIP-600-D200', 600, 200), shelfItem('RIP-600-D300', 600, 300)],
      async (provider) => {
        const rules = await provider.getRules('TONDO', 300);
        expect(rules.shelfByWidthMm.get(600)?.sku).toBe('RIP-600-D300');
      },
    );
  });

  it('getRules returns every depth when no filter is given', async () => {
    await withCatalogServer(
      [shelfItem('RIP-A', 600, 200), shelfItem('RIP-B', 800, 300)],
      async (provider) => {
        const rules = await provider.getRules('TONDO');
        expect(rules.shelfByWidthMm.size).toBe(2);
      },
    );
  });

  it('getRules also filters PIEDINO/MONTANTE/TERMINALE when they carry a real depth (KUBE)', async () => {
    await withCatalogServer(
      [footItem('PIE-40-D200', 40, 200), footItem('PIE-40-D300', 40, 300)],
      async (provider) => {
        const rules = await provider.getRules('KUBE', 200);
        expect(rules.footByHeightMm.get(40)?.sku).toBe('PIE-40-D200');
        expect(rules.footHeightsMm).toEqual([40]);
      },
    );
  });

  it('getRules never filters out PIEDINO/MONTANTE/TERMINALE with depthMm 0 (TONDO/QUADRO)', async () => {
    await withCatalogServer(
      [footItem('PIE-40-D0', 40, 0)],
      async (provider) => {
        const rules = await provider.getRules('TONDO', 300);
        expect(rules.footByHeightMm.get(40)?.sku).toBe('PIE-40-D0');
      },
    );
  });

  it('getAvailableDepthsMm returns the distinct sorted shelf depths for a category', async () => {
    await withCatalogServer(
      [shelfItem('RIP-A', 600, 300), shelfItem('RIP-B', 800, 200), shelfItem('RIP-C', 1000, 300)],
      async (provider) => {
        await expect(provider.getAvailableDepthsMm('TONDO')).resolves.toEqual([200, 300]);
      },
    );
  });
});
