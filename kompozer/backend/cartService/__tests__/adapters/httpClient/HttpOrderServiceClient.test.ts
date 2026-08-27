/**
 * Wiring smoke test for HttpOrderServiceClient's retry policy.
 *
 * POST /orders is NOT idempotent — a timeout or 5xx doesn't tell us whether
 * the order was actually created before the response was lost. This locks
 * in that submitOrder must NOT retry on timeout/5xx (only a connection that
 * never reached the server is safe to retry), unlike the read-only adapters.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { HttpOrderServiceClient } from '../../../src/adapters/httpClient/HttpOrderServiceClient';
import { OrderSubmissionError } from '../../../src/domain/entities/errors';

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

const INPUT = {
  userId: 'usr_1',
  expeditionInfo: {
    name: 'Mario',
    surname: 'Rossi',
    mail: 'mario@example.com',
    nation: 'Italia',
    city: 'Milano',
    cap: '20100',
    address: 'Via Roma 10',
    phone: '+390212345678',
  },
  items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1, lineTotal: 1990 }],
  total: 1990,
};

describe('HttpOrderServiceClient — retry policy', () => {
  it('does NOT retry a 500 response — a single attempt only, to avoid a duplicate order', async () => {
    let callCount = 0;
    const { baseUrl, close } = await startServer((_req, res) => {
      callCount += 1;
      res.writeHead(500);
      res.end();
    });

    try {
      const client = new HttpOrderServiceClient(baseUrl, 1000);
      await expect(client.submitOrder(INPUT)).rejects.toBeInstanceOf(OrderSubmissionError);
      expect(callCount).toBe(1);
    } finally {
      await close();
    }
  });

  it('still succeeds on the first attempt when the server responds 200', async () => {
    const { baseUrl, close } = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'ord_1', status: 'SUBMITTED', submittedAt: new Date().toISOString() }));
    });

    try {
      const client = new HttpOrderServiceClient(baseUrl, 1000);
      const result = await client.submitOrder(INPUT);
      expect(result.orderId).toBe('ord_1');
    } finally {
      await close();
    }
  });
});
