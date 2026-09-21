/**
 * orderService composition root.
 * Wires concrete repository and use cases, mounts HTTP routes,
 * and configures middleware.
 */
import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { buildOrderRouter } from './adapters/http/orderRouter';
import { errorMiddleware } from './adapters/http/errorMiddleware';
import { MongoOrderRepository } from './adapters/persistence/MongoOrderRepository';
import { logger, redactUrl } from './infrastructure/logger';
import { CancelOrder } from './useCases/CancelOrder';
import { CreateOrder } from './useCases/CreateOrder';
import { GetOrder } from './useCases/GetOrder';
import { ListOrders } from './useCases/ListOrders';
import { UpdateOrderStatus } from './useCases/UpdateOrderStatus';
import { HandlePaymentEvent } from './useCases/HandlePaymentEvent';
import { RedisPaymentEventsSubscriber } from './adapters/messaging/subscribers/RedisPaymentEventsSubscriber';

export interface OrderAppConfig {
  redisUrl?: string;
}

export function buildApp(config: OrderAppConfig = {}) {
  const repo = new MongoOrderRepository();

  const createOrder = new CreateOrder(repo);
  const listOrders = new ListOrders(repo);
  const getOrder = new GetOrder(repo);
  const cancelOrder = new CancelOrder(repo);
  const updateOrderStatus = new UpdateOrderStatus(repo);

  if (config.redisUrl) {
    const paymentEventHandler = new HandlePaymentEvent(repo);
    const redis = new Redis(config.redisUrl);
    const paymentSubscriber = new RedisPaymentEventsSubscriber(redis, paymentEventHandler);
    void paymentSubscriber.start().catch((error) => {
      logger.error({ err: error }, 'Failed to start payment events subscriber');
    });
  } else {
    logger.warn(
      { event: 'order.redis.disabled' },
      'Redis disabled: orders will not be forwarded automatically on payment completion',
    );
  }

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
      autoLogging: { ignore: (req) => req.url === '/health' },
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

  app.use(
    '/orders',
    buildOrderRouter({
      createOrder,
      listOrders,
      getOrder,
      cancelOrder,
      updateOrderStatus,
    }),
  );

  app.use(errorMiddleware);

  return app;
}
