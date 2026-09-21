/**
 * JWT gateway middleware.
 *
 * Security model:
 * 1) The gateway is the only component that verifies JWT signatures.
 * 2) After successful verification, identity is propagated through
 *    X-User-Id, X-User-Role, and X-Session-Id headers.
 * 3) Downstream services trust only these injected identity headers,
 *    never the original raw JWT.
 *
 * Public routes are explicitly excluded from JWT enforcement.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { MissingTokenError, InvalidTokenError } from '../errors';

interface JwtPayload {
  userId: string;
  tokenId: string;
  role: string;
}

const PUBLIC_ROUTES: Array<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/auth\/register$/ },
  { method: 'POST', path: /^\/auth\/login$/ },
  { method: 'POST', path: /^\/auth\/guest$/ },
];

function isPublic(req: Request): boolean {
  return PUBLIC_ROUTES.some(
    (r) => r.method === req.method && r.path.test(req.path),
  );
}

/**
 * Builds the JWT validation middleware with a fixed signing secret.
 */
export function buildJwtMiddleware(jwtSecret: string) {
  return function jwtMiddleware(req: Request, _res: Response, next: NextFunction): void {
    // Strip identity headers from every incoming request — including public routes.
    // Prevents clients from spoofing X-User-Id / X-User-Role / X-Session-Id
    // on routes that skip JWT verification (OWASP A01 — Broken Access Control).
    delete req.headers['x-user-id'];
    delete req.headers['x-user-role'];
    delete req.headers['x-session-id'];

    if (isPublic(req)) {
      return next();
    }

    const authHeader = req.headers['authorization'];
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Browser Socket.IO clients cannot reliably set Authorization headers.
    // For realtime channels, allow ?token=<jwt> fallback during handshake/polling.
    if (!token && req.path.startsWith('/cad/collab/socket.io')) {
      const queryToken = req.query['token'];
      if (typeof queryToken === 'string' && queryToken.trim()) {
        token = queryToken;
      }
    }

    if (!token) {
      return next(new MissingTokenError());
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch {
      return next(new InvalidTokenError());
    }

    // Injecting identity headers — downstream services read ONLY these
    req.headers['x-user-id'] = payload.userId;
    req.headers['x-user-role'] = payload.role;
    req.headers['x-session-id'] = payload.tokenId;

    next();
  };
}
