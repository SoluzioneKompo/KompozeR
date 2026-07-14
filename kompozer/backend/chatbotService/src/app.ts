import cors from 'cors';
import express from 'express';
import { HttpCadConfigurationProvider } from './adapters/httpClient/HttpCadConfigurationProvider';
import { buildChatbotRouter } from './adapters/http/chatbotRouter';
import { errorMiddleware } from './adapters/http/errorMiddleware';
import { HttpCatalogQaProvider } from './adapters/httpClient/HttpCatalogQaProvider';
import { MistralAnswerGenerator } from './adapters/httpClient/MistralAnswerGenerator';
import { MongoChatRepository } from './adapters/persistence/MongoChatRepository';
import { CloseSession } from './useCases/CloseSession';
import { CreateSession } from './useCases/CreateSession';
import { GetSession } from './useCases/GetSession';
import { ListSessionMessages } from './useCases/ListSessionMessages';
import { SendSessionMessage } from './useCases/SendSessionMessage';

/** Optional dependency overrides used to assemble the chatbot HTTP app. */
export interface ChatbotAppConfig {
  catalogBaseUrl?: string;
  cadBaseUrl?: string;
  mistralApiKey?: string;
  mistralModel?: string;
  mistralBaseUrl?: string;
}

/** Builds the Express app and its use-case wiring for the chatbot service. */
export function buildApp(config: ChatbotAppConfig = {}) {
  const repo = new MongoChatRepository();
  const catalog = new HttpCatalogQaProvider(config.catalogBaseUrl ?? 'http://catalog-service:3002');
  const cad = new HttpCadConfigurationProvider(config.cadBaseUrl ?? 'http://cad-service:3003');

  const answerGenerator = config.mistralApiKey?.trim()
    ? new MistralAnswerGenerator({
        apiKey: config.mistralApiKey,
        model: config.mistralModel,
        baseUrl: config.mistralBaseUrl,
      })
    : undefined;

  const createSession = new CreateSession(repo);
  const getSession = new GetSession(repo);
  const listSessionMessages = new ListSessionMessages(repo);
  const closeSession = new CloseSession(repo);
  const sendSessionMessage = new SendSessionMessage(repo, catalog, cad, answerGenerator);

  const deps = {
    createSession,
    getSession,
    listSessionMessages,
    closeSession,
    sendSessionMessage,
  };

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    '/chatbot',
    buildChatbotRouter(deps),
  );

  app.use(errorMiddleware);

  return {
    app,
    deps,
  };
}
