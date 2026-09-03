/**
 * Composition root for the API Gateway.
 *
 * Builds and wires middleware, protected/public routers, proxy routes,
 * and centralized gateway error handling.
 *
 * Exposed as a factory to simplify test setup.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { logger, redactUrl } from './infrastructure/logger';
import { buildJwtMiddleware } from './middleware/jwtMiddleware';
import { gatewayErrorMiddleware } from './middleware/gatewayErrorMiddleware';
import { buildRateLimiters } from './middleware/rateLimiters';
import { buildRoutes, ServiceUrls } from './routes/index';
import { buildHealthRouter } from './routes/health';
import { buildBffRouter } from './routes/bff';

export interface GatewayConfig {
  jwtSecret: string;
  services: ServiceUrls;
  /** Redis connection string. When set, rate limits are shared across gateway replicas. */
  redisUrl?: string;
}

/**
 * Creates a configured Express application instance for the gateway.
 *
 * Middleware order is intentional:
 * 1) security and parsing middleware,
 * 2) public health and websocket channels,
 * 3) JWT guard,
 * 4) protected BFF/proxy routes,
 * 5) centralized error translation.
 */
export function buildApp(config: GatewayConfig) {
  const app = express();
  const { generalLimiter, authLimiter } = buildRateLimiters(config.redisUrl);

  const notificationsWsProxy = createProxyMiddleware({
    target: config.services.notification,
    changeOrigin: true,
    ws: true,
  });

  app.locals['notificationsWsProxy'] = notificationsWsProxy;

  app.use(cors());
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      // The gateway is the system's edge: it mints the trace id and forwards it
      // downstream (as a plain header, so it survives the proxy) so one request
      // can be followed across every service in Grafana/Loki.
      genReqId: (req, res) => {
        const traceId = randomUUID();
        req.headers['x-trace-id'] = traceId;
        res.setHeader('x-trace-id', traceId);
        return traceId;
      },
      customProps: (req) => ({ traceId: req.id }),
      autoLogging: { ignore: (req) => req.url === '/healthz' },
      // Full header/query dumps are debugging noise for a human scanning
      // Grafana — keep the per-request line to what matters at a glance.
      serializers: {
        req: (req) => ({ method: req.method, url: redactUrl(req.url) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Per-IP request cap, applied before body parsing so oversized/abusive
  // traffic is rejected as cheaply as possible.
  app.use(generalLimiter);

  app.use(express.json());

  // Real-time notifications channel is handled before JWT route guarding.
  app.use('/ws/notifications', notificationsWsProxy);

  // Liveness probe target: proves the gateway process itself is responsive.
  // Deliberately does NOT check downstream services — unlike /health below,
  // which does — so a downstream outage never triggers a gateway restart.
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  // Public health endpoint must remain reachable without authentication.
  app.use(buildHealthRouter(config.services));

  // JWT verification — runs before every route except public ones
  app.use(buildJwtMiddleware(config.jwtSecret));

  // Tighter per-IP cap on the unauthenticated auth routes — these are the
  // ones a credential-stuffing/brute-force script would actually hit.
  app.post(['/auth/register', '/auth/login', '/auth/guest'], authLimiter);

  // BFF aggregation routes — protected, called directly by the SPA
  app.use(buildBffRouter(config.services));

  // Proxy routes — forward to individual downstream services
  app.use(buildRoutes(config.services));

  app.use(gatewayErrorMiddleware);

  return app;
}
