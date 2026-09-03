import { NextFunction, Request, Response, Router } from 'express';
import { GetOrderTrend } from '../../useCases/GetOrderTrend';
import { logger } from '../../infrastructure/logger';

/** Dependencies required by reporting HTTP routes. */
export interface ReportingRouterDeps {
  getOrderTrend: GetOrderTrend;
}

/** Falls back to the module logger when pino-http isn't wired (e.g. unit tests). */
const logFor = (req: Request) => req.log ?? logger;

/** Wraps async route handlers and forwards failures to Express. */
function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

/** Requires the gateway-propagated user identity header. */
function requireUserId(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    logFor(req).warn(
      { event: 'reporting.request.rejected', code: 'UNAUTHORIZED', status: 401 },
      'Missing identity header X-User-Id',
    );
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

/** Requires an ADMIN role for reporting endpoints. */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.headers['x-user-role'];
  if (typeof role !== 'string' || role.toUpperCase() !== 'ADMIN') {
    logFor(req).warn(
      { event: 'reporting.request.rejected', code: 'FORBIDDEN', status: 403 },
      'Admin role required',
    );
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

/** Builds the reporting router. */
export function buildReportingRouter(deps: ReportingRouterDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get(
    '/trends/orders',
    requireUserId,
    requireAdmin,
    wrap(async (req, res) => {
      const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
      const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;

      const trend = await deps.getOrderTrend.execute({ from, to });
      logFor(req).info(
        { event: 'reporting.trend.generated', from: trend.from, to: trend.to, days: trend.days },
        'Order trend report generated',
      );
      res.json(trend);
    }),
  );

  return router;
}
