/**
 * paymentService composition root.
 * Wires the Mongo repository and gateway factory to use cases and
 * mounts the HTTP router.
 */
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger, redactUrl } from './infrastructure/logger';
import { MongoPaymentRepository } from './adapters/persistence/MongoPaymentRepository';
import { CreatePayment } from './useCases/CreatePayment';
import { GetPayment } from './useCases/GetPayment';
import { GetPaymentByOrder } from './useCases/GetPaymentByOrder';
import { ConfirmPayment } from './useCases/ConfirmPayment';
import { PaymentGatewayFactory } from './infrastructure/PaymentGatewayFactory';
import { buildPaymentRouter } from './adapters/http/paymentRouter';
import { errorMiddleware } from './adapters/http/errorMiddleware';

export function buildApp() {
  const repo = new MongoPaymentRepository();
  const gatewayFactory = new PaymentGatewayFactory();

  const createPayment = new CreatePayment(repo, gatewayFactory);
  const getPayment = new GetPayment(repo);
  const getPaymentByOrder = new GetPaymentByOrder(repo);
  const confirmPayment = new ConfirmPayment(repo);

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

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(
    '/payments',
    buildPaymentRouter({
      createPayment,
      getPayment,
      getPaymentByOrder,
      confirmPayment,
    }),
  );

  app.use(errorMiddleware);

  return app;
}
