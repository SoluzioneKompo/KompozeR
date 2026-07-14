import { AnswerGenerator } from '../../src/domain/ports/AnswerGenerator';
import { SessionClosedError } from '../../src/domain/entities/errors';
import { CreateSession } from '../../src/useCases/CreateSession';
import { SendSessionMessage } from '../../src/useCases/SendSessionMessage';
import { FakeCatalogQaProvider, FakeChatRepository } from '../helpers/fakes';

/** Unit tests for chatbot message sending and answer generation. */
describe('SendSessionMessage', () => {
  it('stores user and bot message with catalog contextual answer', async () => {
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

    const createSession = new CreateSession(repo);
    const sendSessionMessage = new SendSessionMessage(repo, catalog);

    const session = await createSession.execute({ userId: 'usr_1' });
    const output = await sendSessionMessage.execute({
      userId: 'usr_1',
      sessionId: session.id,
      content: 'Quanto costa SKU-001?',
    });

    expect(output.userMessage.role).toBe('USER');
    expect(output.botMessage.role).toBe('BOT');
    expect(output.botMessage.content).toContain('SKU-001');

    const messages = await repo.listMessagesBySessionId(session.id);
    expect(messages).toHaveLength(2);
  });

  it('throws when session is already closed', async () => {
    const repo = new FakeChatRepository();
    const catalog = new FakeCatalogQaProvider();

    const createSession = new CreateSession(repo);
    const sendSessionMessage = new SendSessionMessage(repo, catalog);

    const session = await createSession.execute({ userId: 'usr_1' });
    await repo.updateSession({
      id: session.id,
      userId: session.userId,
      status: 'CLOSED',
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(),
    });

    await expect(
      sendSessionMessage.execute({
        userId: 'usr_1',
        sessionId: session.id,
        content: 'ciao',
      }),
    ).rejects.toBeInstanceOf(SessionClosedError);
  });

  it('uses the LLM answer when an answer generator is provided', async () => {
    const repo = new FakeChatRepository();
    const catalog = new FakeCatalogQaProvider();
    catalog.setItems([
      { id: 'cmp_1', sku: 'SKU-001', name: 'Ripiano 80', price: 1990, isAvailable: true },
    ]);
    const llm: AnswerGenerator = {
      generate: async () => 'Risposta generata dall LLM',
    };

    const createSession = new CreateSession(repo);
    const sendSessionMessage = new SendSessionMessage(repo, catalog, undefined, llm);

    const session = await createSession.execute({ userId: 'usr_1' });
    const output = await sendSessionMessage.execute({
      userId: 'usr_1',
      sessionId: session.id,
      content: 'Consigliami un ripiano',
    });

    expect(output.botMessage.content).toBe('Risposta generata dall LLM');
  });

  it('falls back to the template answer when the LLM fails', async () => {
    const repo = new FakeChatRepository();
    const catalog = new FakeCatalogQaProvider();
    catalog.setItems([
      { id: 'cmp_1', sku: 'SKU-001', name: 'Ripiano 80', price: 1990, isAvailable: true },
    ]);
    const llm: AnswerGenerator = {
      generate: async () => {
        throw new Error('LLM unavailable');
      },
    };

    const createSession = new CreateSession(repo);
    const sendSessionMessage = new SendSessionMessage(repo, catalog, undefined, llm);

    const session = await createSession.execute({ userId: 'usr_1' });
    const output = await sendSessionMessage.execute({
      userId: 'usr_1',
      sessionId: session.id,
      content: 'Consigliami un ripiano',
    });

    expect(output.botMessage.content).toContain('SKU-001');
  });
});
