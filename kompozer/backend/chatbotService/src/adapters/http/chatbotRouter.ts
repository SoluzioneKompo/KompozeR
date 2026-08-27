import { NextFunction, Request, Response, Router } from 'express';
import { CloseSession } from '../../useCases/CloseSession';
import { CreateSession } from '../../useCases/CreateSession';
import { GetSession } from '../../useCases/GetSession';
import { ListSessionMessages } from '../../useCases/ListSessionMessages';
import { SendSessionMessage } from '../../useCases/SendSessionMessage';
import { validateBody } from './validateBody';
import { createSessionSchema, sendMessageSchema } from './chatbotSchemas';

/** Dependencies required by the chatbot HTTP router. */
export interface ChatbotRouterDeps {
  createSession: CreateSession;
  getSession: GetSession;
  listSessionMessages: ListSessionMessages;
  closeSession: CloseSession;
  sendSessionMessage: SendSessionMessage;
}

/** Wraps async handlers and forwards failures to Express error middleware. */
function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

/** Enforces the gateway-propagated user identity for protected routes. */
function requireUserId(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing identity header X-User-Id',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }
  next();
}

/** Builds the chatbot REST router. */
export function buildChatbotRouter(deps: ChatbotRouterDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.post(
    '/sessions',
    requireUserId,
    validateBody(createSessionSchema),
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;

      const session = await deps.createSession.execute({
        userId,
        configurationId: req.body.configurationId,
      });

      res.status(201).json(session);
    }),
  );

  router.get(
    '/sessions/:sessionId',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const sessionId = req.params['sessionId'] as string;
      const session = await deps.getSession.execute({ userId, sessionId });
      res.json(session);
    }),
  );

  router.get(
    '/sessions/:sessionId/messages',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const sessionId = req.params['sessionId'] as string;
      const messages = await deps.listSessionMessages.execute({ userId, sessionId });
      res.json(messages);
    }),
  );

  router.patch(
    '/sessions/:sessionId/close',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const sessionId = req.params['sessionId'] as string;
      const session = await deps.closeSession.execute({ userId, sessionId });
      res.json(session);
    }),
  );

  router.post(
    '/sessions/:sessionId/messages',
    requireUserId,
    validateBody(sendMessageSchema),
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const sessionId = req.params['sessionId'] as string;

      const output = await deps.sendSessionMessage.execute({
        userId,
        sessionId,
        content: req.body.content,
      });

      res.status(201).json(output);
    }),
  );

  return router;
}
