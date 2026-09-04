/**
 * HTTP-level test coverage for order router endpoints.
 */
import express from 'express';
import request from 'supertest';
import { buildOrderRouter } from '../../src/adapters/http/orderRouter';
import { errorMiddleware } from '../../src/adapters/http/errorMiddleware';
import { CancelOrder } from '../../src/useCases/CancelOrder';
import { CreateOrder } from '../../src/useCases/CreateOrder';
import { GetOrder } from '../../src/useCases/GetOrder';
import { ListOrders } from '../../src/useCases/ListOrders';
import { UpdateOrderStatus } from '../../src/useCases/UpdateOrderStatus';
import { FakeOrderRepository } from '../helpers/fakes';

const expeditionInfo = {
  name: 'Mario',
  surname: 'Rossi',
  mail: 'mario.rossi@example.com',
  nation: 'Italia',
  city: 'Milano',
  cap: '20100',
  address: 'Via Roma 10',
  phone: '+390212345678',
  deliveryNotes: 'Citofono Rossi',
};

function buildTestApp() {
  const repo = new FakeOrderRepository();

  const app = express();
  app.use(express.json());
  app.use(
    '/orders',
    buildOrderRouter({
      createOrder: new CreateOrder(repo),
      listOrders: new ListOrders(repo),
      getOrder: new GetOrder(repo),
      cancelOrder: new CancelOrder(repo),
      updateOrderStatus: new UpdateOrderStatus(repo),
    }),
  );
  app.use(errorMiddleware);

  return { app, repo };
}

/** Simulates a completed payment, moving an order past AWAITING_PAYMENT. */
async function forwardOrder(repo: FakeOrderRepository, orderId: string): Promise<void> {
  const order = await repo.findById(orderId);
  if (!order) throw new Error('Order not found in fake repository');
  await repo.update({ ...order, status: 'SUBMITTED' });
}

describe('orderRouter', () => {
  it('POST /orders -> 401 when identity header is missing', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/orders').send({});
    expect(res.status).toBe(401);
  });

  it('order lifecycle works for owner', async () => {
    const { app } = buildTestApp();

    const createRes = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [
          {
            sku: 'SKU-001',
            name: 'Ripiano',
            unitPrice: 1990,
            quantity: 2,
          },
        ],
        total: 3980,
      });

    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id as string;

    const listRes = await request(app).get('/orders').set('x-user-id', 'usr_1');
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);

    const getRes = await request(app).get(`/orders/${orderId}`).set('x-user-id', 'usr_1');
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(orderId);

    const cancelRes = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('x-user-id', 'usr_1')
      .send({});

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');
  });

  it('POST /orders -> 422 when an item has the wrong type instead of being persisted as-is', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: '1990', quantity: 2 }],
        total: 3980,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /orders -> 422 on unknown/extra top-level fields', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
        total: 1990,
        userId: 'spoofed-user',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /orders/:id/status -> 422 when status is omitted instead of silently defaulting to DONE', async () => {
    const { app } = buildTestApp();

    const createRes = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
        total: 1990,
      });
    const orderId = createRes.body.id as string;

    const res = await request(app)
      .patch(`/orders/${orderId}/status`)
      .set('x-user-id', 'adm_1')
      .set('x-user-role', 'ADMIN')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /orders -> 400 on syntactically invalid JSON', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('GET /orders -> admin sees orders from all users', async () => {
    const { app } = buildTestApp();

    await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
        total: 1990,
      });

    await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_2')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-002', name: 'Montante', unitPrice: 990, quantity: 2 }],
        total: 1980,
      });

    const listRes = await request(app)
      .get('/orders')
      .set('x-user-id', 'adm_1')
      .set('x-user-role', 'ADMIN');

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(2);
    const userIds = listRes.body.items.map((item: { userId: string }) => item.userId);
    expect(userIds).toEqual(expect.arrayContaining(['usr_1', 'usr_2']));
  });

  it('PATCH /orders/:id/status -> 403 for non-admin user', async () => {
    const { app } = buildTestApp();

    const createRes = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
        total: 1990,
      });

    const orderId = createRes.body.id as string;

    const updateRes = await request(app)
      .patch(`/orders/${orderId}/status`)
      .set('x-user-id', 'usr_1')
      .set('x-user-role', 'BASE')
      .send({ status: 'DONE' });

    expect(updateRes.status).toBe(403);
    expect(updateRes.body.error.code).toBe('FORBIDDEN');
  });

  it('PATCH /orders/:id/status -> 200 for admin and sets DONE', async () => {
    const { app, repo } = buildTestApp();

    const createRes = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
        total: 1990,
      });

    const orderId = createRes.body.id as string;
    await forwardOrder(repo, orderId);

    const updateRes = await request(app)
      .patch(`/orders/${orderId}/status`)
      .set('x-user-id', 'adm_1')
      .set('x-user-role', 'ADMIN')
      .send({ status: 'DONE' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe('DONE');
    expect(updateRes.body.doneAt).toEqual(expect.any(String));
  });

  it('PATCH /orders/:id/cancel -> 403 for non-admin on another user order', async () => {
    const { app } = buildTestApp();

    const createRes = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
        total: 1990,
      });

    const orderId = createRes.body.id as string;

    const cancelRes = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('x-user-id', 'usr_2')
      .set('x-user-role', 'BASE')
      .send({});

    expect(cancelRes.status).toBe(403);
    expect(cancelRes.body.error.code).toBe('FORBIDDEN');
  });

  it('PATCH /orders/:id/cancel -> 200 for admin on another user order', async () => {
    const { app } = buildTestApp();

    const createRes = await request(app)
      .post('/orders')
      .set('x-user-id', 'usr_1')
      .send({
        expeditionInfo,
        items: [{ sku: 'SKU-001', name: 'Ripiano', unitPrice: 1990, quantity: 1 }],
        total: 1990,
      });

    const orderId = createRes.body.id as string;

    const cancelRes = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('x-user-id', 'adm_1')
      .set('x-user-role', 'ADMIN')
      .send({});

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');
    expect(cancelRes.body.cancelledAt).toEqual(expect.any(String));
  });
});
