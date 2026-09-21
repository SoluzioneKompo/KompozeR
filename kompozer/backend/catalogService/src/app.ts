/**
 * catalogService composition root.
 * Instantiates concrete dependencies and assembles the Express app.
 * Publisher selection depends on USE_REDIS:
 * - true: RedisCatalogEventPublisher (production)
 * - false: NoopCatalogEventPublisher (development without Redis)
 */
import express from 'express';
import { Request, Response } from 'express';
import cors    from 'cors';
import Redis   from 'ioredis';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger, redactUrl }            from './infrastructure/logger';
import { MongoCatalogRepository }       from './adapters/persistence/MongoCatalogRepository';
import { SystemClock }                  from './infrastructure/SystemClock';
import { UuidIdGenerator }              from './infrastructure/UuidIdGenerator';
import { NoopCatalogEventPublisher }    from './infrastructure/NoopCatalogEventPublisher';
import { RedisCatalogEventPublisher }   from './adapters/messaging/publishers/RedisCatalogEventPublisher';
import { buildCatalogRouter }           from './adapters/http/catalogRouter';
import { errorMiddleware }              from './adapters/http/errorMiddleware';
import { ListComponents }               from './useCases/ListComponents';
import { GetComponent }                 from './useCases/GetComponent';
import { CreateComponent }              from './useCases/CreateComponent';
import { UpdateComponent }              from './useCases/UpdateComponent';
import { DeleteComponent }              from './useCases/DeleteComponent';
import { CatalogEventPublisher }        from './domain/ports/CatalogEventPublisher';

export interface AppConfig {
  redisUrl?: string;
}

export function buildApp(config: AppConfig = {}) {
  const componentRepo = new MongoCatalogRepository();
  const clock         = new SystemClock();
  const idGenerator   = new UuidIdGenerator();
  const eventIdGen    = new UuidIdGenerator();

  let publisher: CatalogEventPublisher;
  if (config.redisUrl) {
    const redis = new Redis(config.redisUrl);
    publisher = new RedisCatalogEventPublisher(redis);
    logger.info({ event: 'catalog.startup.redis_connected' }, `Redis event publisher connected: ${config.redisUrl}`);
  } else {
    publisher = new NoopCatalogEventPublisher();
    logger.info({ event: 'catalog.startup.noop_publisher' }, 'Using noop event publisher (no Redis configured)');
  }

  const listComponents  = new ListComponents(componentRepo);
  const getComponent    = new GetComponent(componentRepo);
  const createComponent = new CreateComponent(componentRepo, clock, idGenerator);
  const updateComponent = new UpdateComponent(componentRepo, publisher, clock, eventIdGen);
  const deleteComponent = new DeleteComponent(componentRepo);

  const app = express();
  app.use(cors());
  app.use(
    pinoHttp({
      logger,
      // This service sits behind api-gateway, which already mints a trace id
      // and forwards it as x-trace-id. Reuse it — never mint a new one — so a
      // single request can be followed end-to-end across services in
      // Grafana/Loki. Only api-gateway (the system's edge) mints.
      genReqId: (req, res) => {
        const incoming = req.headers['x-trace-id'];
        const traceId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
        res.setHeader('x-trace-id', traceId);
        return traceId;
      },
      customProps: (req) => ({ traceId: req.id }),
      autoLogging: { ignore: (req) => req.url === '/health' },
      // Full header/query dumps are debugging noise for a human scanning
      // Grafana — keep the per-request line to what matters at a glance.
      serializers: {
        req: (req) => ({ method: req.method, url: redactUrl(req.url) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

  app.use(
    '/catalog',
    buildCatalogRouter({
      listComponents,
      getComponent,
      createComponent,
      updateComponent,
      deleteComponent,
    }),
  );

  app.use(errorMiddleware);

  return app;
}
