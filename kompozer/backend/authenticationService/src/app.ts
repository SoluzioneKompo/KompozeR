/**
 * Composition root for the Authentication Service.
 *
 * Instantiates concrete dependencies (Mongo repositories, bcrypt hasher,
 * JWT signer, clock, id generators), wires use cases through dependency
 * injection, and assembles the Express app with CORS, routing, and
 * centralized error middleware.
 *
 * Exported as a factory to simplify integration testing.
 */
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from './infrastructure/logger';
import { RegisterUser } from './useCases/RegisterUser';
import { LoginUser } from './useCases/LoginUser';
import { GenerateGuestSession } from './useCases/GenerateGuestSession';
import { LogoutUser } from './useCases/LogoutUser';
import { GetCurrentUser } from './useCases/GetCurrentUser';
import { ListUserSessions } from './useCases/ListUserSessions';
import { RevokeSession } from './useCases/RevokeSession';
import { MongoUserRepository } from './adapters/persistence/MongoUserRepository';
import { MongoSessionRepository } from './adapters/persistence/MongoSessionRepository';
import { BcryptPasswordHasher } from './infrastructure/BcryptPasswordHasher';
import { JwtTokenSigner } from './infrastructure/JwtTokenSigner';
import { SystemClock } from './infrastructure/SystemClock';
import { UuidIdGenerator } from './infrastructure/UuidIdGenerator';
import { buildAuthRouter } from './adapters/http/authRouter';
import { errorMiddleware } from './adapters/http/errorMiddleware';

export interface AppConfig {
  jwtSecret: string;
  sessionTtlMs: number;
}

/**
 * Builds the configured Express application instance.
 */
export function buildApp(config: AppConfig) {
  const userRepo = new MongoUserRepository();
  const sessionRepo = new MongoSessionRepository();
  const hasher = new BcryptPasswordHasher();
  const signer = new JwtTokenSigner(config.jwtSecret);
  const clock = new SystemClock();
  const userIdGen = new UuidIdGenerator();
  const sessionIdGen = new UuidIdGenerator();
  const tokenIdGen = new UuidIdGenerator();
  const guestIdGen = new UuidIdGenerator();

  const registerUser = new RegisterUser(userRepo, hasher, clock, userIdGen);
  const loginUser = new LoginUser(
    userRepo,
    sessionRepo,
    hasher,
    signer,
    clock,
    sessionIdGen,
    tokenIdGen,
    config.sessionTtlMs,
  );
  const generateGuestSession = new GenerateGuestSession(
    sessionRepo,
    signer,
    clock,
    guestIdGen,
    sessionIdGen,
    tokenIdGen,
    config.sessionTtlMs,
  );
  const logoutUser = new LogoutUser(sessionRepo, clock);
  const getCurrentUser = new GetCurrentUser(userRepo, sessionRepo, clock);
  const listUserSessions = new ListUserSessions(sessionRepo);
  const revokeSession = new RevokeSession(sessionRepo, userRepo);

  const app = express();
  app.use(cors());
  app.use(
    pinoHttp({
      logger,
      // Reuse the trace id propagated by the gateway when present, so a single
      // request can be followed across services in Grafana/Loki.
      genReqId: (req, res) => {
        const incoming = req.headers['x-trace-id'];
        const traceId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
        res.setHeader('x-trace-id', traceId);
        return traceId;
      },
      customProps: (req) => ({ traceId: req.id }),
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(
    '/auth',
    buildAuthRouter({
      registerUser,
      loginUser,
      generateGuestSession,
      logoutUser,
      getCurrentUser,
      listUserSessions,
      revokeSession,
    }),
  );

  app.use(errorMiddleware);

  return app;
}
