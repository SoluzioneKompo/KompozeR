/**
 * Express router for order endpoints.
 * Enforces identity/role headers and delegates business rules to use cases.
 */
import { NextFunction, Request, Response, Router } from 'express';
import { CancelOrder } from '../../useCases/CancelOrder';
import { CreateOrder } from '../../useCases/CreateOrder';
import { GetOrder } from '../../useCases/GetOrder';
import { ListOrders } from '../../useCases/ListOrders';
import { UpdateOrderStatus } from '../../useCases/UpdateOrderStatus';
import { validateBody } from './validateBody';
import { createOrderSchema, updateOrderStatusSchema } from './orderSchemas';

export interface OrderRouterDeps {
  createOrder: CreateOrder;
  listOrders: ListOrders;
  getOrder: GetOrder;
  cancelOrder: CancelOrder;
  updateOrderStatus: UpdateOrderStatus;
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

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.headers['x-user-role'];
  if (typeof role !== 'string' || role.toUpperCase() !== 'ADMIN') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin role required',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }
  next();
}

export function buildOrderRouter(deps: OrderRouterDeps) {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  router.post(
    '/',
    requireUserId,
    validateBody(createOrderSchema),
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const order = await deps.createOrder.execute({
        userId,
        expeditionInfo: req.body.expeditionInfo,
        items: req.body.items,
        total: req.body.total,
      });

      res.status(201).json(order);
    }),
  );

  router.get(
    '/',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const role = req.headers['x-user-role'];
      const orders = await deps.listOrders.execute({
        userId,
        role: typeof role === 'string' ? role : undefined,
      });
      res.json(orders);
    }),
  );

  router.get(
    '/:orderId',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const orderId = req.params['orderId'] as string;
      const order = await deps.getOrder.execute({ userId, orderId });
      res.json(order);
    }),
  );

  router.patch(
    '/:orderId/cancel',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const role = req.headers['x-user-role'];
      const orderId = req.params['orderId'] as string;
      const order = await deps.cancelOrder.execute({
        userId,
        orderId,
        role: typeof role === 'string' ? role : undefined,
      });
      res.json(order);
    }),
  );

  router.patch(
    '/:orderId/status',
    requireUserId,
    requireAdmin,
    validateBody(updateOrderStatusSchema),
    wrap(async (req, res) => {
      const orderId = req.params['orderId'] as string;

      const order = await deps.updateOrderStatus.execute({
        orderId,
        status: req.body.status,
      });

      res.json(order);
    }),
  );

  return router;
}
