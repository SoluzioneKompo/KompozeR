/**
 * Express router for endpoints under /catalog.
 * Roles:
 * - GET /catalog, GET /catalog/:id, GET /catalog/health are public.
 * - POST/PUT/DELETE catalog endpoints require ADMIN.
 *
 * ADMIN enforcement relies on X-User-Role injected by gateway after JWT
 * verification. This router never handles raw JWT tokens.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logger';
import { ListComponents }  from '../../useCases/ListComponents';
import { GetComponent }    from '../../useCases/GetComponent';
import { CreateComponent } from '../../useCases/CreateComponent';
import { UpdateComponent } from '../../useCases/UpdateComponent';
import { DeleteComponent } from '../../useCases/DeleteComponent';
import { ComponentCategory } from '../../domain/entities/ComponentCategory';
import { validateBody } from './validateBody';
import { createComponentSchema, updateComponentSchema } from './catalogSchemas';

export interface CatalogRouterDeps {
  listComponents:  ListComponents;
  getComponent:    GetComponent;
  createComponent: CreateComponent;
  updateComponent: UpdateComponent;
  deleteComponent: DeleteComponent;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.headers['x-user-role'];
  if (role !== 'ADMIN') {
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

function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
}

export function buildCatalogRouter(deps: CatalogRouterDeps) {
  const router = Router();

  // pino-http attaches req.log in the real app; fall back to the base logger
  // when the router is mounted without it (e.g. in HTTP tests).
  const logFor = (req: Request) => req.log ?? logger;

  // GET /catalog/health - health check (must be before /:id).
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // GET /catalog - paginated and filtered list.
  router.get(
    '/',
    wrap(async (req, res) => {
      const { category, minPrice, maxPrice, available, search, page, limit } = req.query;
      const result = await deps.listComponents.execute({
        category:  category ? (category as ComponentCategory) : undefined,
        minPrice:  minPrice  ? Number(minPrice)  : undefined,
        maxPrice:  maxPrice  ? Number(maxPrice)  : undefined,
        available: available !== undefined ? available === 'true' : undefined,
        search:    search    ? String(search)    : undefined,
        page:      page      ? Number(page)      : undefined,
        limit:     limit     ? Number(limit)     : undefined,
      });
      res.json(result);
    }),
  );

  // GET /catalog/:id - single component.
  router.get(
    '/:id',
    wrap(async (req, res) => {
      const dto = await deps.getComponent.execute({ id: req.params['id'] });
      res.json(dto);
    }),
  );

  // POST /catalog - create component (ADMIN).
  router.post(
    '/',
    requireAdmin,
    validateBody(createComponentSchema),
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const dto = await deps.createComponent.execute({
        ...req.body,
        requestingUserId: userId,
      });
      logFor(req).info(
        { event: 'catalog.item.created', componentId: dto.id, sku: dto.sku },
        'Catalog item created',
      );
      res.status(201).json(dto);
    }),
  );

  // PUT /catalog/:id - update component (ADMIN).
  router.put(
    '/:id',
    requireAdmin,
    validateBody(updateComponentSchema),
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const dto = await deps.updateComponent.execute({
        ...req.body,
        id:               req.params['id'],
        requestingUserId: userId,
      });
      logFor(req).info(
        { event: 'catalog.item.updated', componentId: dto.id, sku: dto.sku, version: dto.version },
        'Catalog item updated',
      );
      res.json(dto);
    }),
  );

  // DELETE /catalog/:id - delete component (ADMIN).
  router.delete(
    '/:id',
    requireAdmin,
    wrap(async (req, res) => {
      const componentId = req.params['id'];
      await deps.deleteComponent.execute({ id: componentId });
      logFor(req).info({ event: 'catalog.item.deleted', componentId }, 'Catalog item deleted');
      res.status(204).send();
    }),
  );

  return router;
}
