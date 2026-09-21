/**
 * HTTP-level test coverage for payment router endpoints.
 */
import express from 'express';
import request from 'supertest';
import { buildPaymentRouter } from '../../src/adapters/http/paymentRouter';
import { errorMiddleware } from '../../src/adapters/http/errorMiddleware';
import { ConfirmPayment } from '../../src/useCases/ConfirmPayment';
import { CreatePayment } from '../../src/useCases/CreatePayment';
import { GetPayment } from '../../src/useCases/GetPayment';
import { GetPaymentByOrder } from '../../src/useCases/GetPaymentByOrder';
import { FakePaymentGatewayFactory, FakePaymentRepository } from '../helpers/fakes';

function buildTestApp() {
  const repo = new FakePaymentRepository();
  const gatewayFactory = new FakePaymentGatewayFactory();

  const app = express();
  app.use(express.json());
  app.use(
    '/payments',
    buildPaymentRouter({
      createPayment: new CreatePayment(repo, gatewayFactory),
      getPayment: new GetPayment(repo),
      getPaymentByOrder: new GetPaymentByOrder(repo),
      confirmPayment: new ConfirmPayment(repo),
    }),
  );
  app.use(errorMiddleware);

  return app;
}

describe('paymentRouter', () => {
  it('POST /payments -> 401 when identity header is missing', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/payments').send({});
    expect(res.status).toBe(401);
  });

  it('payment lifecycle works for owner: create -> get -> confirm', async () => {
    const app = buildTestApp();

    const createRes = await request(app)
      .post('/payments')
      .set('x-user-id', 'usr_1')
      .send({ orderId: 'order_1', method: 'PAYPAL', amount: 1990, currency: 'EUR' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('PENDING');
    const paymentId = createRes.body.id as string;

    const getRes = await request(app).get(`/payments/${paymentId}`).set('x-user-id', 'usr_1');
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(paymentId);

    const byOrderRes = await request(app).get('/payments/order/order_1').set('x-user-id', 'usr_1');
    expect(byOrderRes.status).toBe(200);
    expect(byOrderRes.body.id).toBe(paymentId);

    const confirmRes = await request(app)
      .post(`/payments/${paymentId}/confirm`)
      .set('x-user-id', 'usr_1')
      .send({ status: 'COMPLETED' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('COMPLETED');
  });

  it('POST /payments -> 422 when method is invalid', async () => {
    const app = buildTestApp();

    const res = await request(app)
      .post('/payments')
      .set('x-user-id', 'usr_1')
      .send({ orderId: 'order_1', method: 'BITCOIN', amount: 1990, currency: 'EUR' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /payments -> 422 on unknown/extra top-level fields', async () => {
    const app = buildTestApp();

    const res = await request(app)
      .post('/payments')
      .set('x-user-id', 'usr_1')
      .send({ orderId: 'order_1', method: 'CARD', amount: 1990, currency: 'EUR', userId: 'spoofed' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /payments -> 400 on syntactically invalid JSON', async () => {
    const app = buildTestApp();

    const res = await request(app)
      .post('/payments')
      .set('x-user-id', 'usr_1')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('GET /payments/:paymentId -> 403 for another user', async () => {
    const app = buildTestApp();

    const createRes = await request(app)
      .post('/payments')
      .set('x-user-id', 'usr_1')
      .send({ orderId: 'order_1', method: 'CARD', amount: 1990, currency: 'EUR' });
    const paymentId = createRes.body.id as string;

    const res = await request(app).get(`/payments/${paymentId}`).set('x-user-id', 'usr_2');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /payments/:paymentId -> 404 for unknown id', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/payments/missing').set('x-user-id', 'usr_1');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('POST /payments/:paymentId/confirm -> 409 when already finalized', async () => {
    const app = buildTestApp();

    const createRes = await request(app)
      .post('/payments')
      .set('x-user-id', 'usr_1')
      .send({ orderId: 'order_1', method: 'CARD', amount: 1990, currency: 'EUR' });
    const paymentId = createRes.body.id as string;

    await request(app)
      .post(`/payments/${paymentId}/confirm`)
      .set('x-user-id', 'usr_1')
      .send({ status: 'COMPLETED' });

    const res = await request(app)
      .post(`/payments/${paymentId}/confirm`)
      .set('x-user-id', 'usr_1')
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_ALREADY_FINALIZED');
  });
});
