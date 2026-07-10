/**
 * Backend-for-Frontend aggregation routes.
 *
 * These routes collapse multiple downstream calls into a single response
 * for the SPA. Aggregation uses Promise.allSettled so one failing service
 * does not block successful peers.
 *
 * All /bff/* endpoints are protected by the JWT middleware mounted in app.ts.
 */
import { Router, Request, Response } from 'express';
import { ServiceUrls } from './index';
import {
  HttpClient,
  IdentityHeaders,
  createServiceClient,
} from '../adapters/httpClient/ServiceClient';

export type ClientFactory = (baseUrl: string, identity: IdentityHeaders) => HttpClient;

/** Extracts identity headers previously injected by the JWT middleware. */
function extractIdentity(req: Request): IdentityHeaders {
  return {
    'x-user-id':    req.headers['x-user-id'] as string | undefined,
    'x-user-role':  req.headers['x-user-role'] as string | undefined,
    'x-session-id': req.headers['x-session-id'] as string | undefined,
  };
}

/** Normalizes Promise.allSettled entries into { data } | { error }. */
function settle<T>(
  result: PromiseSettledResult<T>,
): { data: T } | { error: string } {
  if (result.status === 'fulfilled') return { data: result.value };
  const msg =
    result.reason instanceof Error
      ? result.reason.message
      : 'service unavailable';
  return { error: msg };
}

/**
 * Builds BFF aggregation endpoints backed by downstream service clients.
 */
export function buildBffRouter(
  services: ServiceUrls,
  clientFactory: ClientFactory = createServiceClient,
): ReturnType<typeof Router> {
  const router = Router();

  // Used by the post-login homepage to aggregate cart, CAD sessions,
  // and unread notification count in a single call.
  router.get(
    '/bff/dashboard',
    async (req: Request, res: Response): Promise<void> => {
      const identity = extractIdentity(req);

      const cartClient   = clientFactory(services.cart,         identity);
      const cadClient    = clientFactory(services.cad,          identity);
      const notifClient  = clientFactory(services.notification, identity);

      const [cart, cadSessions, notifications] = await Promise.allSettled([
        cartClient.get('/cart'),
        cadClient.get('/sessions'),
        notifClient.get('/notifications/unread/count'),
      ]);

      res.json({
        cart:          settle(cart),
        cadSessions:   settle(cadSessions),
        notifications: settle(notifications),
      });
    },
  );

  // Used by the configurator screen to fetch session snapshot and catalog
  // data together so the SPA can update pricing/state with fewer round-trips.
  router.get(
    '/bff/configurator/:sessionId',
    async (req: Request, res: Response): Promise<void> => {
      const { sessionId } = req.params;
      const identity = extractIdentity(req);

      const cadClient     = clientFactory(services.cad,     identity);
      const catalogClient = clientFactory(services.catalog,  identity);

      const [snapshot, catalogItems] = await Promise.allSettled([
        cadClient.get(`/sessions/${sessionId}/snapshot`),
        catalogClient.get('/catalog/items'),
      ]);

      res.json({
        snapshot:     settle(snapshot),
        catalogItems: settle(catalogItems),
      });
    },
  );

  return router;
}
