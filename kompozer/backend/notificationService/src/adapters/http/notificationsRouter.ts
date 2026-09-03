/**
 * Express router for notifications and subscriptions endpoints.
 * Requires X-User-Id identity header and delegates behavior to use cases.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logger';
import { CountUnreadNotifications } from '../../useCases/CountUnreadNotifications';
import { ListNotifications } from '../../useCases/ListNotifications';
import { MarkNotificationRead } from '../../useCases/MarkNotificationRead';
import { CreateSubscription } from '../../useCases/CreateSubscription';
import { ListSubscriptions } from '../../useCases/ListSubscriptions';
import { GetSubscription } from '../../useCases/GetSubscription';
import { UpdateSubscription } from '../../useCases/UpdateSubscription';
import { DeleteSubscription } from '../../useCases/DeleteSubscription';
import { validateBody } from './validateBody';
import { createSubscriptionSchema, updateSubscriptionSchema } from './notificationSchemas';

export interface NotificationsRouterDeps {
  listNotifications: ListNotifications;
  countUnreadNotifications: CountUnreadNotifications;
  markNotificationRead: MarkNotificationRead;
  createSubscription: CreateSubscription;
  listSubscriptions: ListSubscriptions;
  getSubscription: GetSubscription;
  updateSubscription: UpdateSubscription;
  deleteSubscription: DeleteSubscription;
}

function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// pino-http attaches req.log in the real app; fall back to the base logger
// so this never throws in test suites that build the router without it wired.
const logFor = (req: Request) => req.log ?? logger;

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

export function buildNotificationsRouter(deps: NotificationsRouterDeps): ReturnType<typeof Router> {
  const router = Router();

  router.get(
    '/subscriptions',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const response = await deps.listSubscriptions.execute({ userId });
      res.json(response);
    }),
  );

  router.post(
    '/subscriptions',
    requireUserId,
    validateBody(createSubscriptionSchema),
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const { scope, targetId, events, channel } = req.body;
      const created = await deps.createSubscription.execute({
        userId,
        scope,
        targetId,
        events,
        channel,
      });
      logFor(req).info(
        { event: 'notification.subscription.created', subscriptionId: created.id, userId, scope, channel },
        'Subscription created',
      );
      res.status(201).json(created);
    }),
  );

  router.get(
    '/subscriptions/:subscriptionId',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const subscriptionId = req.params['subscriptionId'] as string;
      const sub = await deps.getSubscription.execute({ userId, subscriptionId });
      res.json(sub);
    }),
  );

  router.patch(
    '/subscriptions/:subscriptionId',
    requireUserId,
    validateBody(updateSubscriptionSchema),
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const subscriptionId = req.params['subscriptionId'] as string;
      const { events, isActive } = req.body;
      const sub = await deps.updateSubscription.execute({
        userId,
        subscriptionId,
        events,
        isActive,
      });
      logFor(req).info(
        { event: 'notification.subscription.updated', subscriptionId, userId, isActive: sub.isActive },
        'Subscription updated',
      );
      res.json(sub);
    }),
  );

  router.delete(
    '/subscriptions/:subscriptionId',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const subscriptionId = req.params['subscriptionId'] as string;
      await deps.deleteSubscription.execute({ userId, subscriptionId });
      logFor(req).info(
        { event: 'notification.subscription.deleted', subscriptionId, userId },
        'Subscription deleted',
      );
      res.status(204).send();
    }),
  );

  router.get(
    '/',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const page = req.query['page'] ? Number(req.query['page']) : undefined;
      const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;
      const unreadOnly = req.query['unread'] === 'true';

      const response = await deps.listNotifications.execute({
        userId,
        page,
        limit,
        unreadOnly,
      });
      res.json(response);
    }),
  );

  router.get(
    '/unread/count',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const response = await deps.countUnreadNotifications.execute({ userId });
      res.json(response);
    }),
  );

  router.patch(
    '/:notificationId/read',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const notificationId = req.params['notificationId'] as string;
      const notification = await deps.markNotificationRead.execute({
        userId,
        notificationId,
      });
      logFor(req).info(
        { event: 'notification.marked_read', notificationId, userId },
        'Notification marked as read',
      );
      res.json(notification);
    }),
  );

  return router;
}
