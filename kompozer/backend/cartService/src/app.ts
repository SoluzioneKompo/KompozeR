/**
 * cartService composition root.
 * Wires concrete adapters (Mongo, HTTP clients, Redis publisher/subscriber)
 * to use cases and mounts the HTTP router.
 */
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { logger, redactUrl } from './infrastructure/logger';
import { MongoCartRepository } from './adapters/persistence/MongoCartRepository';
import { HttpCatalogSnapshotProvider } from './adapters/httpClient/HttpCatalogSnapshotProvider';
import { HttpOrderServiceClient } from './adapters/httpClient/HttpOrderServiceClient';
import { RedisCartEventPublisher } from './adapters/messaging/publishers/RedisCartEventPublisher';
import { RedisCatalogEventsSubscriber } from './adapters/messaging/subscribers/RedisCatalogEventsSubscriber';
import { GetCart } from './useCases/GetCart';
import { UpsertCartItem } from './useCases/UpsertCartItem';
import { RemoveCartItem } from './useCases/RemoveCartItem';
import { ClearCart } from './useCases/ClearCart';
import { CheckoutCart } from './useCases/CheckoutCart';
import { RestoreUnavailableItems } from './useCases/RestoreUnavailableItems';
import { buildCartRouter } from './adapters/http/cartRouter';
import { errorMiddleware } from './adapters/http/errorMiddleware';
import { CartEventPublisher } from './domain/ports/CartEventPublisher';
import { NoopCartEventPublisher } from './infrastructure/NoopCartEventPublisher';

export interface CartAppConfig {
  catalogBaseUrl?: string;
  orderBaseUrl?: string;
  redisUrl?: string;
}

export function buildApp(config: CartAppConfig = {}) {
  const repo = new MongoCartRepository();
  const catalog = new HttpCatalogSnapshotProvider(config.catalogBaseUrl || 'http://catalog-service:3002');
  const order = new HttpOrderServiceClient(config.orderBaseUrl || 'http://order-service:3008');
  let eventPublisher: CartEventPublisher = new NoopCartEventPublisher();

  if (config.redisUrl) {
    const redis = new Redis(config.redisUrl);
    eventPublisher = new RedisCartEventPublisher(redis);

    const restoreUnavailableItems = new RestoreUnavailableItems(repo, catalog, eventPublisher);
    const catalogSubscriber = new RedisCatalogEventsSubscriber(config.redisUrl, restoreUnavailableItems);
    void catalogSubscriber.start().catch((error) => {
      logger.error({ err: error }, 'Failed to start catalog events subscriber');
    });
  }

  const getCart = new GetCart(repo, catalog, eventPublisher);
  const upsertCartItem = new UpsertCartItem(repo, eventPublisher);
  const removeCartItem = new RemoveCartItem(repo, eventPublisher);
  const clearCart = new ClearCart(repo, eventPublisher);
  const checkoutCart = new CheckoutCart(repo, catalog, order, eventPublisher);

  const app = express();
  app.use(cors());
  app.use(
    pinoHttp({
      logger,
      // cartService sits BEHIND the api-gateway, which already mints a trace
      // id and forwards it as the x-trace-id header. Reuse it — do NOT mint a
      // new one — so one request can be followed end-to-end across services
      // in Grafana/Loki. Only api-gateway (the system's edge) mints.
      genReqId: (req, res) => {
        const incoming = req.headers['x-trace-id'];
        const traceId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
        res.setHeader('x-trace-id', traceId);
        return traceId;
      },
      customProps: (req) => ({ traceId: req.id }),
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/cart/health' },
      serializers: {
        req: (req) => ({ method: req.method, url: redactUrl(req.url) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(
    '/cart',
    buildCartRouter({
      getCart,
      upsertCartItem,
      removeCartItem,
      clearCart,
      checkoutCart,
    }),
  );

  app.use(errorMiddleware);

  return app;
}
