/**
 * Rate limiting for the gateway — the single public entry point.
 *
 * Two tiers:
 * - `authLimiter`: tight, per-IP limit on the unauthenticated auth routes
 *   (register/login/guest) to blunt credential-stuffing/brute-force attempts.
 * - `generalLimiter`: looser, per-IP limit applied to every other request.
 *
 * Backed by Redis when REDIS_URL is configured so limits are shared across
 * gateway replicas and survive restarts; falls back to the in-memory store
 * (single-process only) otherwise — fine for local/dev and for tests, which
 * never pass a redisUrl.
 */
import { NextFunction, Request, Response } from 'express';
import rateLimit, { Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';

type RedisReply = boolean | number | string | (boolean | number | string)[];
type SendCommandFn = (...args: string[]) => Promise<RedisReply>;

function rateLimitedResponse(req: Request, res: Response, _next: NextFunction): void {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
      timestamp: new Date().toISOString(),
    },
  });
}

function buildStore(client: Redis, prefix: string): Store {
  const sendCommand: SendCommandFn = (...args) =>
    (client.call as (...cmd: string[]) => Promise<RedisReply>)(...args);
  return new RedisStore({ prefix, sendCommand });
}

export interface RateLimiters {
  generalLimiter: ReturnType<typeof rateLimit>;
  authLimiter: ReturnType<typeof rateLimit>;
}

/** Builds the gateway rate limiters. Pass `redisUrl` for a shared/distributed store. */
export function buildRateLimiters(redisUrl?: string): RateLimiters {
  const client = redisUrl ? new Redis(redisUrl) : undefined;

  const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitedResponse,
    store: client ? buildStore(client, 'rl:gateway:general:') : undefined,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitedResponse,
    store: client ? buildStore(client, 'rl:gateway:auth:') : undefined,
  });

  return { generalLimiter, authLimiter };
}
