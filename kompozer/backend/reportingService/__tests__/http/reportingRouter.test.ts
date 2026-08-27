import request from 'supertest';
import { buildApp } from '../../src/app';
import { DailyOrderTrendPoint, OrderTrendReader } from '../../src/domain/ports/OrderTrendReader';

/** HTTP tests for reporting routes and authorization checks. */
class FakeOrderTrendReader implements OrderTrendReader {
  async fetchDaily(fromInclusive: Date, toInclusive: Date): Promise<DailyOrderTrendPoint[]> {
    return [
      {
        date: fromInclusive.toISOString().slice(0, 10),
        submitted: 1,
        done: 0,
        cancelled: 0,
        totalOrders: 1,
        revenue: 99,
      },
      {
        date: toInclusive.toISOString().slice(0, 10),
        submitted: 0,
        done: 1,
        cancelled: 0,
        totalOrders: 1,
        revenue: 120,
      },
    ];
  }
}

describe('reportingRouter', () => {
  it('GET /reports/trends/orders -> 401 when identity header missing', async () => {
    const app = buildApp({ trendReader: new FakeOrderTrendReader() });

    const res = await request(app).get('/reports/trends/orders');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('UNAUTHORIZED');
  });

  it('GET /reports/trends/orders -> 403 when role is not admin', async () => {
    const app = buildApp({ trendReader: new FakeOrderTrendReader() });

    const res = await request(app)
      .get('/reports/trends/orders')
      .set('x-user-id', 'usr_1')
      .set('x-user-role', 'USER');

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  it('GET /reports/trends/orders -> 200 for admin', async () => {
    const app = buildApp({ trendReader: new FakeOrderTrendReader() });

    const res = await request(app)
      .get('/reports/trends/orders?from=2026-06-01&to=2026-06-02')
      .set('x-user-id', 'adm_1')
      .set('x-user-role', 'ADMIN');

    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2026-06-01');
    expect(res.body.to).toBe('2026-06-02');
    expect(res.body.points).toHaveLength(2);
    expect(res.body.totals.totalOrders).toBe(2);
  });

  it('GET /reports/trends/orders -> 422 for invalid date format', async () => {
    const app = buildApp({ trendReader: new FakeOrderTrendReader() });

    const res = await request(app)
      .get('/reports/trends/orders?from=06-01-2026&to=2026-06-02')
      .set('x-user-id', 'adm_1')
      .set('x-user-role', 'ADMIN');

    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
  });

  it('GET /reports/trends/orders -> 400 on syntactically invalid JSON body', async () => {
    const app = buildApp({ trendReader: new FakeOrderTrendReader() });

    const res = await request(app)
      .get('/reports/trends/orders')
      .set('x-user-id', 'adm_1')
      .set('x-user-role', 'ADMIN')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
  });
});
