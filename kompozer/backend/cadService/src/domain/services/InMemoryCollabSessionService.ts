import crypto from 'crypto';
import { Category } from '../entities/Category';
import {
  ColumnDesign,
  ColumnPlan,
  Configuration,
  Environment,
  validateConfigurationModel,
} from '../entities/Configuration';
import {
  CollabOperationStaleError,
  ForbiddenError,
  ResourceNotFoundError,
  SessionExpiredError,
  ValidationError,
} from '../entities/errors';
import { ConfigurationRepository } from '../ports/ConfigurationRepository';

export type CollabFieldPath = 'name' | 'category' | 'environment' | 'columnPlan' | 'columnDesigns';

export interface CreateCollabSessionInput {
  configurationId: string;
  hostUserId: string;
}

export interface JoinCollabSessionInput {
  sessionId: string;
  configurationId: string;
  userId: string;
}

export interface JoinCollabSessionByIdInput {
  sessionId: string;
  userId: string;
}

export interface LeaveCollabSessionInput {
  sessionId: string;
  configurationId: string;
  userId: string;
}

export interface ApplyCollabOperationInput {
  sessionId: string;
  configurationId: string;
  userId: string;
  opId: string;
  lamport: number;
  fieldPath: CollabFieldPath;
  value: unknown;
  baseVersion: number;
}

export interface CollabSessionOutput {
  sessionId: string;
  configurationId: string;
  lamport: number;
  participants: string[];
  ttlSeconds: number;
  snapshot: Configuration;
}

export interface CollabOperationOutput {
  sessionId: string;
  lamport: number;
  applied: boolean;
  duplicate: boolean;
  snapshot: Configuration;
}

export interface FindSessionForUserInput {
  configurationId: string;
  userId: string;
  sessionId?: string;
}

type SessionFieldClock = {
  lamport: number;
  actorId: string;
};

type SessionState = {
  sessionId: string;
  configurationId: string;
  hostUserId: string;
  participants: Set<string>;
  snapshot: Configuration;
  lamport: number;
  expiresAtMs: number;
  appliedOpIds: Set<string>;
  fieldClocks: Map<CollabFieldPath, SessionFieldClock>;
};

const SUPPORTED_FIELD_PATHS: CollabFieldPath[] = [
  'name',
  'category',
  'environment',
  'columnPlan',
  'columnDesigns',
];

/**
 * In-memory collaborative sessions for Sprint 6 MVP.
 *
 * Sessions are ephemeral and identified by a shareable sessionId.
 * Conflicts are solved through Lamport timestamp ordering with actor-id tie-break.
 */
export class InMemoryCollabSessionService {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly ttlMs: number = 15 * 60 * 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async createSession(input: CreateCollabSessionInput): Promise<CollabSessionOutput> {
    this.pruneExpiredSessions();

    const configuration = await this.configurationRepository.findById(input.configurationId);
    if (!configuration) {
      throw new ResourceNotFoundError('Configuration not found');
    }

    if (configuration.ownerId !== input.hostUserId) {
      throw new ForbiddenError('Only the owner can create collaborative sessions for this configuration');
    }

    const sessionId = crypto.randomUUID();
    const nowMs = this.now();
    const snapshot = this.cloneConfiguration(configuration);

    const state: SessionState = {
      sessionId,
      configurationId: configuration.id,
      hostUserId: input.hostUserId,
      participants: new Set([input.hostUserId]),
      snapshot,
      lamport: 1,
      expiresAtMs: nowMs + this.ttlMs,
      appliedOpIds: new Set(),
      fieldClocks: new Map(),
    };

    this.sessions.set(sessionId, state);
    return this.toOutput(state);
  }

  async joinSession(input: JoinCollabSessionInput): Promise<CollabSessionOutput> {
    const session = this.getActiveSession(input.sessionId, input.configurationId);
    session.participants.add(input.userId);
    await this.configurationRepository.addCollaborator(input.configurationId, input.userId);
    this.touch(session);
    return this.toOutput(session);
  }

  async joinSessionById(input: JoinCollabSessionByIdInput): Promise<CollabSessionOutput> {
    const session = this.getActiveSessionById(input.sessionId);
    session.participants.add(input.userId);
    await this.configurationRepository.addCollaborator(session.configurationId, input.userId);
    this.touch(session);
    return this.toOutput(session);
  }

  findSessionForUser(input: FindSessionForUserInput): CollabSessionOutput | null {
    this.pruneExpiredSessions();

    if (input.sessionId?.trim()) {
      const session = this.sessions.get(input.sessionId.trim());
      if (!session) {
        return null;
      }
      if (session.configurationId !== input.configurationId) {
        return null;
      }
      if (!session.participants.has(input.userId)) {
        return null;
      }
      return this.toOutput(session);
    }

    for (const session of this.sessions.values()) {
      if (session.configurationId !== input.configurationId) {
        continue;
      }
      if (!session.participants.has(input.userId)) {
        continue;
      }
      return this.toOutput(session);
    }

    return null;
  }

  async leaveSession(input: LeaveCollabSessionInput): Promise<void> {
    const session = this.getActiveSession(input.sessionId, input.configurationId);
    session.participants.delete(input.userId);

    if (session.participants.size === 0) {
      this.sessions.delete(session.sessionId);
      return;
    }

    this.touch(session);
  }

  async getSnapshot(input: JoinCollabSessionInput): Promise<CollabSessionOutput> {
    const session = this.getActiveSession(input.sessionId, input.configurationId);
    session.participants.add(input.userId);
    this.touch(session);
    return this.toOutput(session);
  }

  async applyOperation(input: ApplyCollabOperationInput): Promise<CollabOperationOutput> {
    const session = this.getActiveSession(input.sessionId, input.configurationId);

    if (!session.participants.has(input.userId)) {
      throw new ForbiddenError('User is not part of the collaborative session');
    }

    if (!input.opId.trim()) {
      throw new ValidationError('opId is required');
    }

    if (!SUPPORTED_FIELD_PATHS.includes(input.fieldPath)) {
      throw new ValidationError(`fieldPath must be one of ${SUPPORTED_FIELD_PATHS.join(', ')}`);
    }

    if (input.baseVersion !== session.snapshot.version) {
      throw new CollabOperationStaleError('baseVersion does not match current session snapshot');
    }

    const nextLamport = Math.max(session.lamport, input.lamport) + 1;
    session.lamport = nextLamport;

    if (session.appliedOpIds.has(input.opId)) {
      this.touch(session);
      return {
        sessionId: session.sessionId,
        lamport: session.lamport,
        applied: false,
        duplicate: true,
        snapshot: this.cloneConfiguration(session.snapshot),
      };
    }

    session.appliedOpIds.add(input.opId);

    const previousClock = session.fieldClocks.get(input.fieldPath);
    const mustApply = this.shouldApply(previousClock, { lamport: input.lamport, actorId: input.userId });

    if (mustApply) {
      this.applyFieldMutation(session.snapshot, input.fieldPath, input.value);
      session.snapshot.version += 1;
      session.snapshot.updatedAt = new Date(this.now());
      validateConfigurationModel(session.snapshot);
      session.fieldClocks.set(input.fieldPath, {
        lamport: input.lamport,
        actorId: input.userId,
      });
    }

    this.touch(session);

    return {
      sessionId: session.sessionId,
      lamport: session.lamport,
      applied: mustApply,
      duplicate: false,
      snapshot: this.cloneConfiguration(session.snapshot),
    };
  }

  private shouldApply(previous: SessionFieldClock | undefined, incoming: SessionFieldClock): boolean {
    if (!previous) {
      return true;
    }

    if (incoming.lamport > previous.lamport) {
      return true;
    }

    if (incoming.lamport < previous.lamport) {
      return false;
    }

    return incoming.actorId > previous.actorId;
  }

  private applyFieldMutation(configuration: Configuration, fieldPath: CollabFieldPath, value: unknown): void {
    switch (fieldPath) {
      case 'name': {
        if (typeof value !== 'string' || !value.trim()) {
          throw new ValidationError('name must be a non-empty string');
        }
        configuration.name = value.trim();
        return;
      }
      case 'category': {
        if (value !== null && typeof value !== 'string') {
          throw new ValidationError('category must be null or string');
        }
        configuration.category = value as Category | null;
        return;
      }
      case 'environment': {
        if (!value || typeof value !== 'object') {
          throw new ValidationError('environment must be an object');
        }
        const typed = value as Partial<Environment>;
        const env: Environment = {
          maxWidthMm: Number(typed.maxWidthMm),
          maxHeightMm: Number(typed.maxHeightMm),
          minWidthMm: Number(typed.minWidthMm),
          minHeightMm: Number(typed.minHeightMm),
          unit: typed.unit ?? 'mm',
        };
        if ([env.maxWidthMm, env.maxHeightMm, env.minWidthMm, env.minHeightMm].some((num) => Number.isNaN(num))) {
          throw new ValidationError('environment values must be numeric');
        }
        if (env.unit !== 'mm') {
          throw new ValidationError('environment unit must be mm');
        }
        configuration.environment = env;
        return;
      }
      case 'columnPlan': {
        if (!value || typeof value !== 'object') {
          throw new ValidationError('columnPlan must be an object');
        }
        const typed = value as Partial<ColumnPlan>;
        const columns = Array.isArray(typed.columns)
          ? typed.columns.map((column) => ({
              index: Number((column as { index?: unknown }).index),
              shelfWidthMm: Number((column as { shelfWidthMm?: unknown }).shelfWidthMm),
            }))
          : null;

        if (!columns) {
          throw new ValidationError('columnPlan.columns must be an array');
        }

        const columnCount = Number(typed.columnCount);
        if (Number.isNaN(columnCount)) {
          throw new ValidationError('columnPlan.columnCount must be numeric');
        }

        if (columns.some((column) => Number.isNaN(column.index) || Number.isNaN(column.shelfWidthMm))) {
          throw new ValidationError('columnPlan column values must be numeric');
        }

        configuration.columnPlan = {
          columnCount,
          columns,
        };
        return;
      }
      case 'columnDesigns': {
        if (!Array.isArray(value)) {
          throw new ValidationError('columnDesigns must be an array');
        }

        const designs: ColumnDesign[] = value.map((designRaw) => {
          if (!designRaw || typeof designRaw !== 'object') {
            throw new ValidationError('each columnDesign must be an object');
          }

          const design = designRaw as {
            columnIndex?: unknown;
            levelsMm?: unknown;
            shelfThicknessMm?: unknown;
          };

          if (!Array.isArray(design.levelsMm)) {
            throw new ValidationError('columnDesign.levelsMm must be an array');
          }

          const levelsMm = design.levelsMm.map((level) => Number(level));
          const mapped: ColumnDesign = {
            columnIndex: Number(design.columnIndex),
            shelfThicknessMm: Number(design.shelfThicknessMm),
            levelsMm,
          };

          if ([mapped.columnIndex, mapped.shelfThicknessMm, ...levelsMm].some((num) => Number.isNaN(num))) {
            throw new ValidationError('columnDesign values must be numeric');
          }

          return mapped;
        });

        configuration.columnDesigns = designs;
        return;
      }
      default:
        throw new ValidationError('Unsupported fieldPath');
    }
  }

  private getActiveSession(sessionId: string, configurationId: string): SessionState {
    const session = this.getActiveSessionById(sessionId);

    if (session.configurationId !== configurationId) {
      throw new ResourceNotFoundError('Collaborative session does not match configuration');
    }

    return session;
  }

  private getActiveSessionById(sessionId: string): SessionState {
    this.pruneExpiredSessions();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ResourceNotFoundError('Collaborative session not found');
    }

    if (session.expiresAtMs <= this.now()) {
      this.sessions.delete(sessionId);
      throw new SessionExpiredError('Collaborative session expired');
    }

    return session;
  }

  private touch(session: SessionState): void {
    session.expiresAtMs = this.now() + this.ttlMs;
  }

  private pruneExpiredSessions(): void {
    const nowMs = this.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAtMs <= nowMs) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private toOutput(session: SessionState): CollabSessionOutput {
    return {
      sessionId: session.sessionId,
      configurationId: session.configurationId,
      lamport: session.lamport,
      participants: [...session.participants].sort(),
      ttlSeconds: Math.floor(this.ttlMs / 1000),
      snapshot: this.cloneConfiguration(session.snapshot),
    };
  }

  private cloneConfiguration(configuration: Configuration): Configuration {
    return {
      ...configuration,
      collaborators: [...configuration.collaborators],
      environment: configuration.environment ? { ...configuration.environment } : null,
      columnPlan: configuration.columnPlan
        ? {
            ...configuration.columnPlan,
            columns: configuration.columnPlan.columns.map((column) => ({ ...column })),
          }
        : null,
      columnDesigns: configuration.columnDesigns.map((design) => ({
        ...design,
        levelsMm: [...design.levelsMm],
      })),
      components: configuration.components.map((item) => ({ ...item })),
      createdAt: new Date(configuration.createdAt),
      updatedAt: new Date(configuration.updatedAt),
    };
  }
}
