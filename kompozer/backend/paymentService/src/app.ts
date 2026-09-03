/**
 * paymentService composition root.
 * Wires the Mongo repository and gateway factory to use cases and
 * mounts the HTTP router.
 */
import express from 'express';
import cors from 'cors';
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
