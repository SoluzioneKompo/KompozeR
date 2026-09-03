/**
 * Express router for payment endpoints.
 * Enforces identity headers and delegates business rules to use cases.
 */
import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../infrastructure/logger';
import { ConfirmPayment } from '../../useCases/ConfirmPayment';
import { CreatePayment } from '../../useCases/CreatePayment';
import { GetPayment } from '../../useCases/GetPayment';
import { GetPaymentByOrder } from '../../useCases/GetPaymentByOrder';
import { validateBody } from './validateBody';
import { createPaymentSchema, confirmPaymentSchema } from './paymentSchemas';

export interface PaymentRouterDeps {
  createPayment: CreatePayment;
  getPayment: GetPayment;
  getPaymentByOrder: GetPaymentByOrder;
  confirmPayment: ConfirmPayment;
}

function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

function requireUserId(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing identity header X-User-Id',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }
  next();
}

export function buildPaymentRouter(deps: PaymentRouterDeps) {
  const router = Router();

  // pino-http attaches req.log in the real app; fall back to the base logger
  // when the router is mounted without it (e.g. in HTTP tests).
  const logFor = (req: Request) => req.log ?? logger;

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  router.post(
    '/',
    requireUserId,
    validateBody(createPaymentSchema),
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const payment = await deps.createPayment.execute({
        userId,
        orderId: req.body.orderId,
        method: req.body.method,
        amount: req.body.amount,
        currency: req.body.currency,
      });

      logFor(req).info(
        {
          event: 'payment.create.success',
          paymentId: payment.id,
          orderId: payment.orderId,
          userId: payment.userId,
          method: payment.method,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
        },
        'Payment created',
      );
      res.status(201).json(payment);
    }),
  );

  router.get(
    '/order/:orderId',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const orderId = req.params['orderId'] as string;
      const payment = await deps.getPaymentByOrder.execute({ userId, orderId });
      res.json(payment);
    }),
  );

  router.get(
    '/:paymentId',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const paymentId = req.params['paymentId'] as string;
      const payment = await deps.getPayment.execute({ userId, paymentId });
      res.json(payment);
    }),
  );

  router.post(
    '/:paymentId/confirm',
    requireUserId,
    validateBody(confirmPaymentSchema),
    wrap(async (req, res) => {
      const paymentId = req.params['paymentId'] as string;
      const payment = await deps.confirmPayment.execute({
        paymentId,
        status: req.body.status,
        failureReason: req.body.failureReason,
      });

      logFor(req).info(
        {
          event: 'payment.confirm.success',
          paymentId: payment.id,
          orderId: payment.orderId,
          status: payment.status,
          providerReference: payment.providerReference,
          failureReason: payment.failureReason,
        },
        'Payment confirmed',
      );
      res.json(payment);
    }),
  );

  return router;
}
