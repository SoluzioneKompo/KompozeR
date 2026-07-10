import { NextFunction, Request, Response, Router } from 'express';
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
  const maxWidthMm = Number(typedBody['maxWidthMm']);
  const maxHeightMm = Number(typedBody['maxHeightMm']);
  const minWidthMm = Number(typedBody['minWidthMm']);
  const minHeightMm = Number(typedBody['minHeightMm']);
  const unit = typedBody['unit'] ?? 'mm';

  if ([maxWidthMm, maxHeightMm, minWidthMm, minHeightMm].some((value) => Number.isNaN(value))) {
    throw new ValidationError('environment dimensions must be numeric');
  }

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
    const index = Number(typedColumn['index']);
    const shelfWidthMm = Number(typedColumn['shelfWidthMm']);

    if (Number.isNaN(index) || Number.isNaN(shelfWidthMm)) {
      throw new ValidationError('Column plan values must be numeric');
    }

    return { index, shelfWidthMm };
  });

  const columnCount = Number(typedBody.columnCount);
  if (Number.isNaN(columnCount)) {
    throw new ValidationError('columnCount must be numeric');
  }

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
    const columnIndex = Number(typedDesign['columnIndex']);
    const shelfThicknessMm = Number(typedDesign['shelfThicknessMm']);
    const rawLevels = typedDesign['levelsMm'];

    if (!Array.isArray(rawLevels)) {
      throw new ValidationError('columnDesign.levelsMm must be an array');
    }

    const levelsMm = rawLevels.map((level) => Number(level));
    if ([columnIndex, shelfThicknessMm, ...levelsMm].some((value) => Number.isNaN(value))) {
      throw new ValidationError('columnDesign values must be numeric');
    }

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
  const lamport = Number(typed['lamport']);
  const baseVersion = Number(typed['baseVersion']);

  if (!opId) {
    throw new ValidationError('opId is required');
  }

  if (typeof fieldPathRaw !== 'string' || !COLLAB_FIELD_PATHS.includes(fieldPathRaw as CollabFieldPath)) {
    throw new ValidationError(`fieldPath must be one of ${COLLAB_FIELD_PATHS.join(', ')}`);
  }

  if (Number.isNaN(lamport)) {
    throw new ValidationError('lamport must be numeric');
  }

  if (Number.isNaN(baseVersion)) {
    throw new ValidationError('baseVersion must be numeric');
  }

  return {
    opId,
    lamport,
    fieldPath: fieldPathRaw as CollabFieldPath,
    value: typed['value'],
    baseVersion,
  };
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
      const ownerId = req.headers['x-user-id'] as string;
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
      const ownerId = req.headers['x-user-id'] as string;
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
      const ownerId = req.headers['x-user-id'] as string;
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
      const ownerId = req.headers['x-user-id'] as string;
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
      const ownerId = req.headers['x-user-id'] as string;
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
      const ownerId = req.headers['x-user-id'] as string;
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
      const ownerId = req.headers['x-user-id'] as string;
      const configuration = await deps.finalizeConfiguration.execute({
        id: req.params['id'],
        ownerId,
      });
      res.json(configuration);
    }),
  );

  router.post(
    '/configurations/:id/reorder',
    requireUserId,
    wrap(async (req, res) => {
      const ownerId = req.headers['x-user-id'] as string;
      const configuration = await deps.reorderConfiguration.execute({
        id: req.params['id'],
        ownerId,
      });
      res.json(configuration);
    }),
  );

  router.post(
    '/configurations/:id/collab/sessions',
    requireUserId,
    wrap(async (req, res) => {
      const hostUserId = req.headers['x-user-id'] as string;
      const session = await deps.collabSessionService.createSession({
        configurationId: req.params['id'],
        hostUserId,
      });

      res.status(201).json({
        sessionId: session.sessionId,
        configurationId: session.configurationId,
        lamport: session.lamport,
        participants: session.participants,
        ttlSeconds: session.ttlSeconds,
        snapshot: session.snapshot,
      });
    }),
  );

  router.post(
    '/configurations/:id/collab/sessions/:sessionId/join',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const session = await deps.collabSessionService.joinSession({
        sessionId: req.params['sessionId'],
        configurationId: req.params['id'],
        userId,
      });

      res.json({
        sessionId: session.sessionId,
        configurationId: session.configurationId,
        lamport: session.lamport,
        participants: session.participants,
        ttlSeconds: session.ttlSeconds,
        snapshot: session.snapshot,
      });
    }),
  );

  router.post(
    '/configurations/:id/collab/sessions/:sessionId/leave',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      await deps.collabSessionService.leaveSession({
        sessionId: req.params['sessionId'],
        configurationId: req.params['id'],
        userId,
      });

      res.status(204).send();
    }),
  );

  router.get(
    '/configurations/:id/collab/sessions/:sessionId/snapshot',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const session = await deps.collabSessionService.getSnapshot({
        sessionId: req.params['sessionId'],
        configurationId: req.params['id'],
        userId,
      });

      res.json({
        sessionId: session.sessionId,
        configurationId: session.configurationId,
        lamport: session.lamport,
        participants: session.participants,
        ttlSeconds: session.ttlSeconds,
        snapshot: session.snapshot,
      });
    }),
  );

  router.post(
    '/configurations/:id/collab/sessions/:sessionId/operations',
    requireUserId,
    wrap(async (req, res) => {
      const userId = req.headers['x-user-id'] as string;
      const operation = parseCollabOperation(req.body);

      const output = await deps.collabSessionService.applyOperation({
        sessionId: req.params['sessionId'],
        configurationId: req.params['id'],
        userId,
        ...operation,
      });

      res.json(output);
    }),
  );

  return router;
}
