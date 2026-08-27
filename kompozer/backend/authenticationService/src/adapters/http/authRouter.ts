/**
 * Express router for /auth endpoints.
 *
 * Registers all authentication routes (register, login, guest, me,
 * sessions, logout, revoke) and delegates execution to dedicated use cases.
 *
 * Authenticated identity is read from X-User-Id / X-User-Role / X-Session-Id
 * headers injected by the API Gateway, never from the raw JWT.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { RegisterUser } from '../../useCases/RegisterUser';
import { LoginUser } from '../../useCases/LoginUser';
import { GenerateGuestSession } from '../../useCases/GenerateGuestSession';
import { LogoutUser } from '../../useCases/LogoutUser';
import { GetCurrentUser } from '../../useCases/GetCurrentUser';
import { ListUserSessions } from '../../useCases/ListUserSessions';
import { RevokeSession } from '../../useCases/RevokeSession';
import { validateBody } from './validateBody';
import { registerSchema, loginSchema } from './authSchemas';

export interface AuthRouterDeps {
  registerUser: RegisterUser;
  loginUser: LoginUser;
  generateGuestSession: GenerateGuestSession;
  logoutUser: LogoutUser;
  getCurrentUser: GetCurrentUser;
  listUserSessions: ListUserSessions;
  revokeSession: RevokeSession;
}

/**
 * All routes under /auth.
 *
 * Identity headers (X-User-Id, X-User-Role, X-Session-Id) are injected by the
 * API gateway after JWT verification. Routes that require authentication rely
 * exclusively on those headers — never on the raw JWT.
 */
export function buildAuthRouter(deps: AuthRouterDeps) {
  const router = Router();

  const wrap =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res, next).catch(next);

  // POST /auth/register — public
  router.post(
    '/register',
    validateBody(registerSchema),
    wrap(async (req, res) => {
      const { username, name, surname, email, password } = req.body as {
        username: string;
        name: string;
        surname: string;
        email: string;
        password: string;
      };
      const result = await deps.registerUser.execute({ username, name, surname, email, password });
      res.status(201).json(result);
    }),
  );

  // POST /auth/login — public
  router.post(
    '/login',
    validateBody(loginSchema),
    wrap(async (req, res) => {
      const body = (req.body ?? {}) as {
        identifier?: string;
        username?: string;
        password: string;
      };
      const identifier = body.identifier ?? body.username ?? '';
      const result = await deps.loginUser.execute({ identifier, password: body.password });
      res.status(200).json(result);
    }),
  );

  // POST /auth/guest — public
  router.post(
    '/guest',
    wrap(async (_req, res) => {
      const result = await deps.generateGuestSession.execute();
      res.status(200).json(result);
    }),
  );

  // GET /auth/me — authenticated (any role)
  router.get(
    '/me',
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const sessionId = req.headers['x-session-id'] as string;
      const result = await deps.getCurrentUser.execute({ userId, sessionId });
      res.status(200).json(result);
    }),
  );

  // GET /auth/sessions — authenticated (any role)
  router.get(
    '/sessions',
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const result = await deps.listUserSessions.execute({ userId });
      res.status(200).json(result);
    }),
  );

  // POST /auth/logout — authenticated (any role)
  router.post(
    '/logout',
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const sessionId = req.headers['x-session-id'] as string;
      await deps.logoutUser.execute({ userId, sessionId });
      res.status(204).send();
    }),
  );

  // DELETE /auth/sessions/:sessionId — authenticated (owner or ADMIN)
  router.delete(
    '/sessions/:sessionId',
    wrap(async (req, res) => {
      const requestingUserId = req.headers['x-user-id'] as string;
      const { sessionId } = req.params;
      await deps.revokeSession.execute({ requestingUserId, sessionId });
      res.status(204).send();
    }),
  );

  return router;
}
