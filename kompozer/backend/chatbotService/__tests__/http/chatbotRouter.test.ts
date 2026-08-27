import express from 'express';
import request from 'supertest';
import { buildChatbotRouter } from '../../src/adapters/http/chatbotRouter';
import { errorMiddleware } from '../../src/adapters/http/errorMiddleware';
import { CloseSession } from '../../src/useCases/CloseSession';
import { CreateSession } from '../../src/useCases/CreateSession';
import { GetSession } from '../../src/useCases/GetSession';
import { ListSessionMessages } from '../../src/useCases/ListSessionMessages';
import { SendSessionMessage } from '../../src/useCases/SendSessionMessage';
import { FakeCatalogQaProvider, FakeChatRepository } from '../helpers/fakes';

/** Integration-style tests for chatbot REST routes. */
function buildTestApp() {
  const repo = new FakeChatRepository();
  const catalog = new FakeCatalogQaProvider();
  catalog.setItems([
    {
      id: 'cmp_1',
      sku: 'SKU-001',
      name: 'Ripiano 80',
      price: 1990,
      isAvailable: true,
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use(
    '/chatbot',
    buildChatbotRouter({
      createSession: new CreateSession(repo),
      getSession: new GetSession(repo),
      listSessionMessages: new ListSessionMessages(repo),
      closeSession: new CloseSession(repo),
      sendSessionMessage: new SendSessionMessage(repo, catalog),
    }),
  );
  app.use(errorMiddleware);

  return app;
}

describe('chatbotRouter', () => {
  it('GET /chatbot/health -> 200', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/chatbot/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /chatbot/sessions -> 401 when identity is missing', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/chatbot/sessions').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('session lifecycle with Q&A works for owner', async () => {
    const app = buildTestApp();

    const createRes = await request(app)
      .post('/chatbot/sessions')
      .set('x-user-id', 'usr_1')
      .send({ configurationId: 'cfg_1' });

    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id as string;

    const sendRes = await request(app)
      .post(`/chatbot/sessions/${sessionId}/messages`)
      .set('x-user-id', 'usr_1')
      .send({ content: 'prezzo SKU-001' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.botMessage.content).toContain('SKU-001');

    const listRes = await request(app)
      .get(`/chatbot/sessions/${sessionId}/messages`)
      .set('x-user-id', 'usr_1');

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(2);

    const closeRes = await request(app)
      .patch(`/chatbot/sessions/${sessionId}/close`)
      .set('x-user-id', 'usr_1')
      .send({});

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe('CLOSED');

    const sendAfterClose = await request(app)
      .post(`/chatbot/sessions/${sessionId}/messages`)
      .set('x-user-id', 'usr_1')
      .send({ content: 'ancora?' });

    expect(sendAfterClose.status).toBe(409);
    expect(sendAfterClose.body.error.code).toBe('SESSION_CLOSED');
  });

  it('POST /chatbot/sessions/:id/messages -> 422 when content is an object instead of crashing', async () => {
    const app = buildTestApp();

    const createRes = await request(app)
      .post('/chatbot/sessions')
      .set('x-user-id', 'usr_1')
      .send({});
    const sessionId = createRes.body.id as string;

    const res = await request(app)
      .post(`/chatbot/sessions/${sessionId}/messages`)
      .set('x-user-id', 'usr_1')
      .send({ content: { not: 'a string' } });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /chatbot/sessions/:id/messages -> 400 on syntactically invalid JSON', async () => {
    const app = buildTestApp();

    const res = await request(app)
      .post('/chatbot/sessions/any-id/messages')
      .set('x-user-id', 'usr_1')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('GET /chatbot/sessions/:id -> 403 for another user', async () => {
    const app = buildTestApp();

    const createRes = await request(app)
      .post('/chatbot/sessions')
      .set('x-user-id', 'usr_1')
      .send({});

    const sessionId = createRes.body.id as string;

    const getRes = await request(app)
      .get(`/chatbot/sessions/${sessionId}`)
      .set('x-user-id', 'usr_2');

    expect(getRes.status).toBe(403);
    expect(getRes.body.error.code).toBe('FORBIDDEN');
  });
});
