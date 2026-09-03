import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { logger } from '../../infrastructure/logger';
import { CATEGORIES, Category, isCategory } from '../../domain/entities/Category';
import { ConfigurationStatus } from '../../domain/entities/ConfigurationStatus';
import { ColumnDesign, ColumnPlan, Environment } from '../../domain/entities/Configuration';
import { ValidationError } from '../../domain/entities/errors';
import {
  CollabFieldPath,
  InMemoryCollabSessionService,
} from '../../domain/services/InMemoryCollabSessionService';
import { GetConfiguration } from '../../useCases/read/GetConfiguration';
import { ListConfigurations } from '../../useCases/read/ListConfigurations';
import { ListNextOptions } from '../../useCases/read/ListNextOptions';
import { CreateConfiguration } from '../../useCases/write/CreateConfiguration';
import { FinalizeConfiguration } from '../../useCases/write/FinalizeConfiguration';
import { ReorderConfiguration } from '../../useCases/write/ReorderConfiguration';
import { SetCategory } from '../../useCases/write/SetCategory';
import { SetColumnPlan } from '../../useCases/write/SetColumnPlan';
import { SetEnvironment } from '../../useCases/write/SetEnvironment';
import { UpdateDesign } from '../../useCases/write/UpdateDesign';

export interface CadRouterDeps {
  createConfiguration: CreateConfiguration;
  listConfigurations: ListConfigurations;
  getConfiguration: GetConfiguration;
  listNextOptions: ListNextOptions;
  setEnvironment: SetEnvironment;
  setCategory: SetCategory;
  setColumnPlan: SetColumnPlan;
  updateDesign: UpdateDesign;
  finalizeConfiguration: FinalizeConfiguration;
  reorderConfiguration: ReorderConfiguration;
  collabSessionService: InMemoryCollabSessionService;
}

const COLLAB_FIELD_PATHS: CollabFieldPath[] = [
  'name',
  'category',
  'environment',
  'columnPlan',
  'columnDesigns',
];

/** Wraps async handlers and forwards rejections to Express error middleware. */
function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// pino-http attaches req.log in the real app; fall back to the base logger
// when the router is mounted without it (e.g. in HTTP tests).
const logFor = (req: Request) => req.log ?? logger;

/** Enforces gateway-propagated user identity for all protected CAD routes. */
function requireUserId(req: Request, res: Response, next: NextFunction): void {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId || typeof ownerId !== 'string') {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing identity header X-User-Id',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  next();
}

const numberSchema = z.number();

/**
 * Strictly validates a numeric field. Unlike `Number(value)`, this rejects
 * booleans, arrays and null instead of silently coercing them to 0/1 —
 * those values used to sneak past the old `Number.isNaN` check and get
 * persisted as valid CAD dimensions.
 */
function requireNumber(value: unknown, field: string): number {
  const result = numberSchema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`${field} must be numeric`);
  }
  return result.data;
}

/** Parses category aliases accepted by the public API payload shape. */
function parseCategory(body: unknown): Category | null | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const typedBody = body as {
    category?: unknown;
    systemType?: unknown;
  };

  if (typedBody.category !== undefined) {
    if (typedBody.category === null) {
      return null;
    }
    if (!isCategory(typedBody.category)) {
      throw new ValidationError(`category must be one of ${CATEGORIES.join(', ')}`);
    }
    return typedBody.category;
  }

  if (typedBody.systemType !== undefined) {
    if (typedBody.systemType === null) {
      return null;
    }
    if (!isCategory(typedBody.systemType)) {
      throw new ValidationError(`systemType must be one of ${CATEGORIES.join(', ')}`);
    }
    return typedBody.systemType;
  }

  return undefined;
}

/** Parses and validates environment payload. */
function parseEnvironment(body: unknown): Environment {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('environment payload is required');
  }

  const typedBody = body as Record<string, unknown>;
  const maxWidthMm = requireNumber(typedBody['maxWidthMm'], 'maxWidthMm');
  const maxHeightMm = requireNumber(typedBody['maxHeightMm'], 'maxHeightMm');
  const minWidthMm = requireNumber(typedBody['minWidthMm'], 'minWidthMm');
  const minHeightMm = requireNumber(typedBody['minHeightMm'], 'minHeightMm');
  const unit = typedBody['unit'] ?? 'mm';

  if (unit !== 'mm') {
    throw new ValidationError('environment unit must be mm');
  }

  return {
    maxWidthMm,
    maxHeightMm,
    minWidthMm,
    minHeightMm,
    unit: 'mm',
  };
}

/** Parses and validates column plan payload. */
function parseColumnPlan(body: unknown): ColumnPlan {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('columnPlan payload is required');
  }

  const typedBody = body as {
    columnCount?: unknown;
    columns?: unknown;
  };

  if (!Array.isArray(typedBody.columns)) {
    throw new ValidationError('columnPlan.columns must be an array');
  }

  const columns = typedBody.columns.map((column): ColumnPlan['columns'][number] => {
    if (!column || typeof column !== 'object') {
      throw new ValidationError('Each columnPlan item must be an object');
    }

    const typedColumn = column as Record<string, unknown>;
    const index = requireNumber(typedColumn['index'], 'columnPlan column index');
    const shelfWidthMm = requireNumber(typedColumn['shelfWidthMm'], 'columnPlan column shelfWidthMm');

    return { index, shelfWidthMm };
  });

  const columnCount = requireNumber(typedBody.columnCount, 'columnCount');

  return { columnCount, columns };
}

/** Parses and validates design payload as a full column snapshot. */
function parseColumnDesigns(body: unknown): ColumnDesign[] {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('design payload is required');
  }

  const typedBody = body as { columnDesigns?: unknown };
  if (!Array.isArray(typedBody.columnDesigns)) {
    throw new ValidationError('columnDesigns must be an array');
  }

  return typedBody.columnDesigns.map((design): ColumnDesign => {
    if (!design || typeof design !== 'object') {
      throw new ValidationError('Each columnDesign must be an object');
    }

    const typedDesign = design as Record<string, unknown>;
    const columnIndex = requireNumber(typedDesign['columnIndex'], 'columnDesign.columnIndex');
    const shelfThicknessMm = requireNumber(typedDesign['shelfThicknessMm'], 'columnDesign.shelfThicknessMm');
    const rawLevels = typedDesign['levelsMm'];

    if (!Array.isArray(rawLevels)) {
      throw new ValidationError('columnDesign.levelsMm must be an array');
    }

    const levelsMm = rawLevels.map((level, i) => requireNumber(level, `columnDesign.levelsMm[${i}]`));

    return {
      columnIndex,
      shelfThicknessMm,
      levelsMm,
    };
  });
}

/** Parses payload for collaborative operation endpoint. */
function parseCollabOperation(body: unknown): {
  opId: string;
  lamport: number;
  fieldPath: CollabFieldPath;
  value: unknown;
  baseVersion: number;
} {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('collab operation payload is required');
  }

  const typed = body as Record<string, unknown>;
  const opId = typeof typed['opId'] === 'string' ? typed['opId'].trim() : '';
  const fieldPathRaw = typed['fieldPath'];
  const lamport = requireNumber(typed['lamport'], 'lamport');
  const baseVersion = requireNumber(typed['baseVersion'], 'baseVersion');

  if (!opId) {
    throw new ValidationError('opId is required');
  }

  if (typeof fieldPathRaw !== 'string' || !COLLAB_FIELD_PATHS.includes(fieldPathRaw as CollabFieldPath)) {
    throw new ValidationError(`fieldPath must be one of ${COLLAB_FIELD_PATHS.join(', ')}`);
  }

  return {
    opId,
    lamport,
    fieldPath: fieldPathRaw as CollabFieldPath,
    value: typed['value'],
    baseVersion,
  };
}

/** Reads optional collaborative session code used to resolve shared-access context. */
function readCollabSessionCode(req: Request): string | undefined {
  const fromQuery = req.query['sessionCode'];
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim();
  }

  const fromHeader = req.headers['x-collab-session-code'];
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim();
  }

  return undefined;
}

/**
 * Keeps owner-scoped use cases unchanged while enabling collaborative participants.
 *
 * If the caller is part of an active collaborative session for the same
 * configuration, we execute with the configuration ownerId.
 */
function resolveEffectiveOwnerId(
  req: Request,
  deps: CadRouterDeps,
  configurationId: string,
  userId: string,
): string {
  const collabSessionCode = readCollabSessionCode(req);
  const session = deps.collabSessionService.findSessionForUser({
    configurationId,
    userId,
    sessionCode: collabSessionCode,
  });

  return session?.snapshot.ownerId ?? userId;
}

/** Builds the HTTP router exposing CAD workflow endpoints. */
export function buildCadRouter(deps: CadRouterDeps) {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  router.post(
    '/configurations',
    requireUserId,
    wrap(async (req, res) => {
      const ownerId = req.headers['x-user-id'] as string;
      const body = (req.body ?? {}) as { name?: unknown };

      const category = parseCategory(req.body);
      const name = typeof body.name === 'string' ? body.name : undefined;

      const configuration = await deps.createConfiguration.execute({
        ownerId,
        name,
        category,
      });

      logFor(req).info(
        { event: 'cad.configuration.created', configurationId: configuration.id, ownerId },
        'CAD configuration created',
      );
      res.status(201).json(configuration);
    }),
  );

  router.get(
    '/configurations',
    requireUserId,
    wrap(async (req, res) => {
      const ownerId = req.headers['x-user-id'] as string;
      const status = req.query['status'];
      const page = req.query['page'];
      const limit = req.query['limit'];

      const configurations = await deps.listConfigurations.execute({
        ownerId,
        status: typeof status === 'string' ? (status as ConfigurationStatus) : undefined,
        page: typeof page === 'string' ? Number(page) : undefined,
        limit: typeof limit === 'string' ? Number(limit) : undefined,
      });

      res.json(configurations);
    }),
  );

  router.get(
    '/configurations/:id',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const ownerId = resolveEffectiveOwnerId(req, deps, req.params['id'], userId);
      const configuration = await deps.getConfiguration.execute({
        id: req.params['id'],
        ownerId,
      });
      res.json(configuration);
    }),
  );

  router.get(
    '/configurations/:id/next-options',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const ownerId = resolveEffectiveOwnerId(req, deps, req.params['id'], userId);
      const rawColumnIndex = req.query['columnIndex'];

      if (typeof rawColumnIndex !== 'string') {
        throw new ValidationError('columnIndex query param is required');
      }

      const columnIndex = Number(rawColumnIndex);
      if (Number.isNaN(columnIndex)) {
        throw new ValidationError('columnIndex must be numeric');
      }

      const output = await deps.listNextOptions.execute({
        id: req.params['id'],
        ownerId,
        columnIndex,
      });

      res.json(output);
    }),
  );

  router.patch(
    '/configurations/:id/environment',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const ownerId = resolveEffectiveOwnerId(req, deps, req.params['id'], userId);
      const configuration = await deps.setEnvironment.execute({
        id: req.params['id'],
        ownerId,
        environment: parseEnvironment(req.body),
      });
      res.json(configuration);
    }),
  );

  router.patch(
    '/configurations/:id/category',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const ownerId = resolveEffectiveOwnerId(req, deps, req.params['id'], userId);
      const category = parseCategory(req.body);
      if (!category) {
        throw new ValidationError('category is required');
      }

      const configuration = await deps.setCategory.execute({
        id: req.params['id'],
        ownerId,
        category,
      });
      res.json(configuration);
    }),
  );

  router.patch(
    '/configurations/:id/column-plan',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const ownerId = resolveEffectiveOwnerId(req, deps, req.params['id'], userId);
      const configuration = await deps.setColumnPlan.execute({
        id: req.params['id'],
        ownerId,
        columnPlan: parseColumnPlan(req.body),
      });
      res.json(configuration);
    }),
  );

  router.patch(
    '/configurations/:id/design',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const ownerId = resolveEffectiveOwnerId(req, deps, req.params['id'], userId);
      const configuration = await deps.updateDesign.execute({
        id: req.params['id'],
        ownerId,
        columnDesigns: parseColumnDesigns(req.body),
      });
      res.json(configuration);
    }),
  );

  router.post(
    '/configurations/:id/finalize',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const ownerId = resolveEffectiveOwnerId(req, deps, req.params['id'], userId);
      const configuration = await deps.finalizeConfiguration.execute({
        id: req.params['id'],
        ownerId,
      });
      logFor(req).info(
        { event: 'cad.configuration.finalized', configurationId: configuration.id, ownerId },
        'CAD configuration finalized',
      );
      res.json(configuration);
    }),
  );

  router.post(
    '/configurations/:id/reorder',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const ownerId = resolveEffectiveOwnerId(req, deps, req.params['id'], userId);
      const configuration = await deps.reorderConfiguration.execute({
        id: req.params['id'],
        ownerId,
      });
      logFor(req).info(
        { event: 'cad.configuration.reordered', configurationId: configuration.id, ownerId },
        'CAD configuration reordered',
      );
      res.json(configuration);
    }),
  );

  // ── Collab: owner creates a session ──────────────────────────────────────
  router.post(
    '/configurations/:id/collab/sessions',
    requireUserId,
    wrap(async (req, res) => {
      const hostUserId = req.headers['x-user-id'] as string;
      const session = await deps.collabSessionService.createSession({
        configurationId: req.params['id'],
        hostUserId,
      });

      logFor(req).info(
        {
          event: 'cad.collab.session.created',
          configurationId: session.configurationId,
          sessionCode: session.sessionCode,
          hostUserId,
        },
        'CAD collaborative session created',
      );
      res.status(201).json({
        sessionCode: session.sessionCode,
        configurationId: session.configurationId,
        lamport: session.lamport,
        participants: session.participants,
        ttlSeconds: session.ttlSeconds,
        ownerId: session.ownerId,
        snapshot: session.snapshot,
      });
    }),
  );

  // ── Collab: participant joins by code (logged or guest) ───────────────────
  router.post(
    '/configurations/:id/collab/join/:code',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const session = await deps.collabSessionService.joinByCode({
        sessionCode: req.params['code'].toUpperCase(),
        userId,
      });

      logFor(req).info(
        {
          event: 'cad.collab.session.joined',
          configurationId: session.configurationId,
          sessionCode: session.sessionCode,
          userId,
        },
        'CAD collaborative session joined',
      );
      res.json({
        sessionCode: session.sessionCode,
        configurationId: session.configurationId,
        lamport: session.lamport,
        participants: session.participants,
        ttlSeconds: session.ttlSeconds,
        ownerId: session.ownerId,
        snapshot: session.snapshot,
      });
    }),
  );

  // ── Collab: leave session ─────────────────────────────────────────────────
  router.post(
    '/configurations/:id/collab/sessions/:code/leave',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      await deps.collabSessionService.leaveSession({
        sessionCode: req.params['code'].toUpperCase(),
        configurationId: req.params['id'],
        userId,
      });

      res.status(204).send();
    }),
  );

  // ── Collab: get snapshot ──────────────────────────────────────────────────
  router.get(
    '/configurations/:id/collab/sessions/:code/snapshot',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const session = await deps.collabSessionService.getSnapshot({
        sessionCode: req.params['code'].toUpperCase(),
        configurationId: req.params['id'],
        userId,
      });

      res.json({
        sessionCode: session.sessionCode,
        configurationId: session.configurationId,
        lamport: session.lamport,
        participants: session.participants,
        ttlSeconds: session.ttlSeconds,
        ownerId: session.ownerId,
        snapshot: session.snapshot,
      });
    }),
  );

  // ── Collab: apply operation ───────────────────────────────────────────────
  router.post(
    '/configurations/:id/collab/sessions/:code/operations',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const operation = parseCollabOperation(req.body);

      const output = await deps.collabSessionService.applyOperation({
        sessionCode: req.params['code'].toUpperCase(),
        configurationId: req.params['id'],
        userId,
        ...operation,
      });

      res.json(output);
    }),
  );

  return router;
}
