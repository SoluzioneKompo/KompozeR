import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { buildReportingRouter } from './adapters/http/reportingRouter';
import { errorMiddleware } from './adapters/http/errorMiddleware';
import { MongoOrderTrendReader } from './adapters/persistence/MongoOrderTrendReader';
import { OrderTrendReader } from './domain/ports/OrderTrendReader';
import { GetOrderTrend } from './useCases/GetOrderTrend';
import { logger, redactUrl } from './infrastructure/logger';

/** Optional overrides for reporting service wiring. */
export interface BuildAppDeps {
  trendReader?: OrderTrendReader;
}

/** Builds the Express application for reporting endpoints. */
export function buildApp(deps: BuildAppDeps = {}) {
  const trendReader = deps.trendReader ?? new MongoOrderTrendReader();
  const getOrderTrend = new GetOrderTrend(trendReader);

  const app = express();
  app.use(cors());
  app.use(
    pinoHttp({
      logger,
      // IMPORTANT: this service sits BEHIND the api-gateway, which already mints
      // a trace id and forwards it as the x-trace-id header. Reuse it — do NOT
      // mint a new one — so one request can be followed end-to-end across
      // services in Grafana/Loki. Only api-gateway (the system's edge) mints.
      genReqId: (req, res) => {
        const incoming = req.headers['x-trace-id'];
        const traceId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
        res.setHeader('x-trace-id', traceId);
        return traceId;
      },
      customProps: (req) => ({ traceId: req.id }),
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/reports/health' },
      serializers: {
        req: (req) => ({ method: req.method, url: redactUrl(req.url) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/reports', buildReportingRouter({ getOrderTrend }));
  app.use(errorMiddleware);

  return app;
}
