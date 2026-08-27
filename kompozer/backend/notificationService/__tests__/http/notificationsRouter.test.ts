/**
 * HTTP-level test coverage for /notifications and /subscriptions endpoints.
 * Uses in-memory fakes (no MongoDB) to exercise the router + schema validation.
 */
import express from 'express';
import request from 'supertest';
import { buildNotificationsRouter } from '../../src/adapters/http/notificationsRouter';
import { errorMiddleware } from '../../src/adapters/http/errorMiddleware';
import { ListNotifications } from '../../src/useCases/ListNotifications';
import { CountUnreadNotifications } from '../../src/useCases/CountUnreadNotifications';
import { MarkNotificationRead } from '../../src/useCases/MarkNotificationRead';
import { CreateSubscription } from '../../src/useCases/CreateSubscription';
import { ListSubscriptions } from '../../src/useCases/ListSubscriptions';
import { GetSubscription } from '../../src/useCases/GetSubscription';
import { UpdateSubscription } from '../../src/useCases/UpdateSubscription';
import { DeleteSubscription } from '../../src/useCases/DeleteSubscription';
import { FakeNotificationRepository } from '../helpers/fakes';

function buildTestApp() {
  const repo = new FakeNotificationRepository();

  const app = express();
  app.use(express.json());
  app.use(
    '/notifications',
    buildNotificationsRouter({
      listNotifications: new ListNotifications(repo),
      countUnreadNotifications: new CountUnreadNotifications(repo),
      markNotificationRead: new MarkNotificationRead(repo),
      createSubscription: new CreateSubscription(repo),
      listSubscriptions: new ListSubscriptions(repo),
      getSubscription: new GetSubscription(repo),
      updateSubscription: new UpdateSubscription(repo),
      deleteSubscription: new DeleteSubscription(repo),
    }),
  );
  app.use(errorMiddleware);

  return app;
}

const VALID_SUBSCRIPTION = {
  scope: 'PRODUCT',
  targetId: 'SKU-001',
  events: ['PRICE_CHANGED'],
  channel: 'IN_APP',
};

describe('notificationsRouter', () => {
  it('GET /notifications -> 401 when identity is missing', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(401);
  });

  it('POST /notifications/subscriptions -> 201 with a valid body', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/notifications/subscriptions')
      .set('x-user-id', 'usr_1')
      .send(VALID_SUBSCRIPTION);

    expect(res.status).toBe(201);
    expect(res.body.targetId).toBe('SKU-001');
  });

  it('POST /notifications/subscriptions -> 422 when events contains a value outside the enum', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/notifications/subscriptions')
      .set('x-user-id', 'usr_1')
      .send({ ...VALID_SUBSCRIPTION, events: ['NOT_A_REAL_EVENT'] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /notifications/subscriptions -> 422 on unknown/extra fields', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/notifications/subscriptions')
      .set('x-user-id', 'usr_1')
      .send({ ...VALID_SUBSCRIPTION, userId: 'spoofed-user' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /notifications/subscriptions/:id -> 200 updating isActive', async () => {
    const app = buildTestApp();
    const created = await request(app)
      .post('/notifications/subscriptions')
      .set('x-user-id', 'usr_1')
      .send(VALID_SUBSCRIPTION);

    const res = await request(app)
      .patch(`/notifications/subscriptions/${created.body.id}`)
      .set('x-user-id', 'usr_1')
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('PATCH /notifications/subscriptions/:id -> 422 when events contains a value outside the enum', async () => {
    const app = buildTestApp();
    const created = await request(app)
      .post('/notifications/subscriptions')
      .set('x-user-id', 'usr_1')
      .send(VALID_SUBSCRIPTION);

    const res = await request(app)
      .patch(`/notifications/subscriptions/${created.body.id}`)
      .set('x-user-id', 'usr_1')
      .send({ events: ['GARBAGE'] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /notifications/subscriptions -> 400 on syntactically invalid JSON', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/notifications/subscriptions')
      .set('x-user-id', 'usr_1')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('DELETE /notifications/subscriptions/:id -> 204', async () => {
    const app = buildTestApp();
    const created = await request(app)
      .post('/notifications/subscriptions')
      .set('x-user-id', 'usr_1')
      .send(VALID_SUBSCRIPTION);

    const res = await request(app)
      .delete(`/notifications/subscriptions/${created.body.id}`)
      .set('x-user-id', 'usr_1');

    expect(res.status).toBe(204);
  });
});
