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
import { CollabCheckpoint, CollabCheckpointStore } from '../ports/CollabCheckpointStore';
import { CollabEventLog } from '../ports/CollabEventLog';
import { ConfigurationRepository } from '../ports/ConfigurationRepository';

export type CollabFieldPath = 'name' | 'category' | 'environment' | 'columnPlan' | 'columnDesigns';

/** Characters used for session codes — excludes visually confusable glyphs (0/O, 1/I/L). */
const SESSION_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SESSION_CODE_LENGTH = 6;

export interface CreateCollabSessionInput {
  configurationId: string;
  hostUserId: string;
}

export interface JoinCollabByCodeInput {
  sessionCode: string;
  userId: string;
}

export interface LeaveCollabSessionInput {
  sessionCode: string;
  configurationId: string;
  userId: string;
}

export interface ApplyCollabOperationInput {
  sessionCode: string;
  configurationId: string;
  userId: string;
  opId: string;
  lamport: number;
  fieldPath: CollabFieldPath;
  value: unknown;
  baseVersion: number;
}

export interface CollabSessionOutput {
  sessionCode: string;
  configurationId: string;
  lamport: number;
  participants: string[];
  ttlSeconds: number;
  snapshot: Configuration;
  ownerId: string;
}

export interface CollabOperationOutput {
  sessionCode: string;
  lamport: number;
  applied: boolean;
  duplicate: boolean;
  snapshot: Configuration;
}

export interface FindSessionForUserInput {
  configurationId: string;
  userId: string;
  sessionCode?: string;
}

type SessionFieldClock = {
  lamport: number;
  actorId: string;
};

type SessionState = {
  sessionCode: string;
  configurationId: string;
  hostUserId: string;
  participants: Set<string>;
  snapshot: Configuration;
  lamport: number;
  expiresAtMs: number;
  appliedOpIds: Set<string>;
  fieldClocks: Map<CollabFieldPath, SessionFieldClock>;
  lastEventSeq: number;
};

type MutationOperation = {
  opId: string;
  lamport: number;
  fieldPath: CollabFieldPath;
  value: unknown;
  actorId: string;
};

const SUPPORTED_FIELD_PATHS: CollabFieldPath[] = [
  'name',
  'category',
  'environment',
  'columnPlan',
  'columnDesigns',
];

/**
 * In-memory collaborative sessions.
 *
 * Sessions are opt-in and owner-driven:
 * - The owner explicitly creates a session via the "Collabora" action, receiving
 *   a short human-readable code (e.g. "A3KP7X").
 * - Participants (logged or guest) join by entering the code.
 * - The session is active while the owner is connected; when the owner leaves the
 *   session is destroyed immediately. The configuration persists only in the owner's DB.
 * - Conflicts are resolved via Lamport timestamps with actor-id tie-break.
 */
export class InMemoryCollabSessionService {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly ttlMs: number = 15 * 60 * 1000,
    private readonly now: () => number = () => Date.now(),
    private readonly checkpointStore?: CollabCheckpointStore,
    private readonly eventLog?: CollabEventLog,
  ) {}

  /**
   * Generates a short, human-readable session code.
   * Retries until a code not currently in use is found.
   */
  private generateSessionCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = Array.from(
        { length: SESSION_CODE_LENGTH },
        () => SESSION_CODE_CHARS[crypto.randomInt(SESSION_CODE_CHARS.length)],
      ).join('');
      if (!this.sessions.has(code)) {
        return code;
      }
    }
    return crypto.randomUUID().replace(/-/g, '').slice(0, SESSION_CODE_LENGTH).toUpperCase();
  }

  /**
   * Creates a new collaborative session for the given configuration.
   * Only the configuration owner can create a session.
   * If the owner already has an active session for this configuration, it is returned as-is.
   */
  async createSession(input: CreateCollabSessionInput): Promise<CollabSessionOutput> {
    this.pruneExpiredSessions();

    const configuration = await this.configurationRepository.findById(input.configurationId);
    if (!configuration) {
      throw new ResourceNotFoundError('Configuration not found');
    }

    if (configuration.ownerId !== input.hostUserId) {
      throw new ForbiddenError('Only the owner can create collaborative sessions for this configuration');
    }

    const existing = this.findSessionByOwner(input.hostUserId, input.configurationId);
    if (existing) {
      this.touch(existing);
      return this.toOutput(existing);
    }

    const sessionCode = this.generateSessionCode();
    const nowMs = this.now();
    const snapshot = this.cloneConfiguration(configuration);

    const state: SessionState = {
      sessionCode,
      configurationId: configuration.id,
      hostUserId: input.hostUserId,
      participants: new Set([input.hostUserId]),
      snapshot,
      lamport: 1,
      expiresAtMs: nowMs + this.ttlMs,
      appliedOpIds: new Set(),
      fieldClocks: new Map(),
      lastEventSeq: 0,
    };

    this.sessions.set(sessionCode, state);
    void this.persistCheckpoint(state);
    return this.toOutput(state);
  }

  private findSessionByOwner(hostUserId: string, configurationId: string): SessionState | null {
    for (const session of this.sessions.values()) {
      if (
        session.hostUserId === hostUserId
        && session.configurationId === configurationId
        && session.expiresAtMs > this.now()
      ) {
        return session;
      }
    }
    return null;
  }

  /**
   * Joins an existing session using the short session code.
   * Any user (logged or guest) can join. No DB write is performed —
   * the collaboration is purely in-memory and ephemeral.
   */
  async joinByCode(input: JoinCollabByCodeInput): Promise<CollabSessionOutput> {
    const session = this.getActiveSessionByCode(input.sessionCode);
    session.participants.add(input.userId);
    this.touch(session);
    return this.toOutput(session);
  }

  findSessionForUser(input: FindSessionForUserInput): CollabSessionOutput | null {
    this.pruneExpiredSessions();

    if (input.sessionCode?.trim()) {
      const session = this.sessions.get(input.sessionCode.trim());
      if (!session || session.configurationId !== input.configurationId) {
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
    const session = this.getActiveSession(input.sessionCode, input.configurationId);
    session.participants.delete(input.userId);

    if (session.participants.size === 0 || session.hostUserId === input.userId) {
      this.sessions.delete(session.sessionCode);
      await this.cleanupPersistence(session.sessionCode);
      return;
    }

    this.touch(session);
  }

  async getSnapshot(input: { sessionCode: string; configurationId: string; userId: string }): Promise<CollabSessionOutput> {
    const session = this.getActiveSession(input.sessionCode, input.configurationId);
    session.participants.add(input.userId);
    this.touch(session);
    return this.toOutput(session);
  }

  async applyOperation(input: ApplyCollabOperationInput): Promise<CollabOperationOutput> {
    const session = this.getActiveSession(input.sessionCode, input.configurationId);

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
        sessionCode: session.sessionCode,
        lamport: session.lamport,
        applied: false,
        duplicate: true,
        snapshot: this.cloneConfiguration(session.snapshot),
      };
    }

    const mustApply = this.mutateFromOperation(session, {
      opId: input.opId,
      lamport: input.lamport,
      fieldPath: input.fieldPath,
      value: input.value,
      actorId: input.userId,
    });

    if (mustApply && this.eventLog) {
      session.lastEventSeq = await this.eventLog.append({
        sessionCode: session.sessionCode,
        opId: input.opId,
        actorId: input.userId,
        lamport: input.lamport,
        fieldPath: input.fieldPath,
        value: input.value,
        resultingVersion: session.snapshot.version,
      });
    }

    this.touch(session);

    return {
      sessionCode: session.sessionCode,
      lamport: session.lamport,
      applied: mustApply,
      duplicate: false,
      snapshot: this.cloneConfiguration(session.snapshot),
    };
  }

  /**
   * Applies an accepted (non-duplicate) operation to the session snapshot using
   * the Lamport + LWW field-level rule. Shared by live edits and crash replay so
   * that recovered state is identical to pre-crash state.
   */
  private mutateFromOperation(session: SessionState, operation: MutationOperation): boolean {
    session.appliedOpIds.add(operation.opId);

    const previousClock = session.fieldClocks.get(operation.fieldPath);
    const mustApply = this.shouldApply(previousClock, {
      lamport: operation.lamport,
      actorId: operation.actorId,
    });

    if (mustApply) {
      this.applyFieldMutation(session.snapshot, operation.fieldPath, operation.value);
      this.applyStatusTransition(session.snapshot, operation.fieldPath);
      session.snapshot.version += 1;
      session.snapshot.updatedAt = new Date(this.now());
      validateConfigurationModel(session.snapshot);
      session.fieldClocks.set(operation.fieldPath, {
        lamport: operation.lamport,
        actorId: operation.actorId,
      });
    }

    return mustApply;
  }

  /** Returns true when the given user is the owner of the specified session. */
  isOwner(sessionCode: string, userId: string): boolean {
    const session = this.sessions.get(sessionCode);
    return session?.hostUserId === userId;
  }

  /**
   * Destroys a session immediately, regardless of remaining participants.
   * Called when the owner disconnects their WebSocket connection.
   */
  destroySession(sessionCode: string): void {
    this.sessions.delete(sessionCode);
    void this.cleanupPersistence(sessionCode);
  }

  /** Returns all active session codes owned by the given user. */
  getSessionCodesOwnedBy(userId: string): string[] {
    this.pruneExpiredSessions();
    const codes: string[] = [];
    for (const session of this.sessions.values()) {
      if (session.hostUserId === userId) {
        codes.push(session.sessionCode);
      }
    }
    return codes;
  }

  /**
   * Periodic checkpoint: persists every active session to stable storage and
   * truncates the events already folded into each checkpoint snapshot.
   */
  async checkpointAllSessions(): Promise<void> {
    if (!this.checkpointStore) {
      return;
    }
    this.pruneExpiredSessions();
    for (const session of this.sessions.values()) {
      await this.persistCheckpoint(session);
    }
  }

  /**
   * Crash recovery: rebuilds in-memory sessions from the latest checkpoints and
   * replays the events logged after each checkpoint. Expired sessions are
   * discarded and their persisted state removed. Returns the recovered codes.
   */
  async recoverSessions(): Promise<string[]> {
    if (!this.checkpointStore) {
      return [];
    }

    const checkpoints = await this.checkpointStore.loadAllCheckpoints();
    const recovered: string[] = [];
    const nowMs = this.now();

    for (const checkpoint of checkpoints) {
      if (checkpoint.expiresAtMs <= nowMs) {
        await this.cleanupPersistence(checkpoint.sessionCode);
        continue;
      }

      const session = this.fromCheckpoint(checkpoint);

      if (this.eventLog) {
        const events = await this.eventLog.readSince(checkpoint.sessionCode, checkpoint.lastEventSeq);
        for (const event of events) {
          this.mutateFromOperation(session, {
            opId: event.opId,
            lamport: event.lamport,
            fieldPath: event.fieldPath as CollabFieldPath,
            value: event.value,
            actorId: event.actorId,
          });
          session.lamport = Math.max(session.lamport, event.lamport + 1);
          session.lastEventSeq = Math.max(session.lastEventSeq, event.seq);
        }
      }

      this.sessions.set(session.sessionCode, session);
      recovered.push(session.sessionCode);
    }

    return recovered;
  }

  private async persistCheckpoint(session: SessionState): Promise<void> {
    if (!this.checkpointStore) {
      return;
    }
    await this.checkpointStore.saveCheckpoint(this.toCheckpoint(session));
    if (this.eventLog) {
      await this.eventLog.truncateUpTo(session.sessionCode, session.lastEventSeq);
    }
  }

  private async cleanupPersistence(sessionCode: string): Promise<void> {
    if (this.checkpointStore) {
      await this.checkpointStore.deleteCheckpoint(sessionCode);
    }
    if (this.eventLog) {
      await this.eventLog.deleteForSession(sessionCode);
    }
  }

  private toCheckpoint(session: SessionState): CollabCheckpoint {
    return {
      sessionCode: session.sessionCode,
      configurationId: session.configurationId,
      hostUserId: session.hostUserId,
      participants: [...session.participants],
      snapshot: this.cloneConfiguration(session.snapshot),
      lamport: session.lamport,
      expiresAtMs: session.expiresAtMs,
      appliedOpIds: [...session.appliedOpIds],
      fieldClocks: [...session.fieldClocks.entries()].map(([fieldPath, clock]) => ({
        fieldPath,
        lamport: clock.lamport,
        actorId: clock.actorId,
      })),
      lastEventSeq: session.lastEventSeq,
      checkpointedAt: new Date(this.now()),
    };
  }

  private fromCheckpoint(checkpoint: CollabCheckpoint): SessionState {
    const fieldClocks = new Map<CollabFieldPath, SessionFieldClock>();
    for (const clock of checkpoint.fieldClocks) {
      fieldClocks.set(clock.fieldPath as CollabFieldPath, {
        lamport: clock.lamport,
        actorId: clock.actorId,
      });
    }

    return {
      sessionCode: checkpoint.sessionCode,
      configurationId: checkpoint.configurationId,
      hostUserId: checkpoint.hostUserId,
      participants: new Set(checkpoint.participants),
      snapshot: this.cloneConfiguration(checkpoint.snapshot),
      lamport: checkpoint.lamport,
      expiresAtMs: checkpoint.expiresAtMs,
      appliedOpIds: new Set(checkpoint.appliedOpIds),
      fieldClocks,
      lastEventSeq: checkpoint.lastEventSeq,
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

  /**
   * Applies the same status transitions that the REST write use cases enforce,
   * so that realtime snapshots have consistent status for all collaborators.
   */
  private applyStatusTransition(configuration: Configuration, fieldPath: CollabFieldPath): void {
    switch (fieldPath) {
      case 'environment':
        configuration.status = configuration.category ? 'CATEGORY_SELECTED' : 'ENVIRONMENT_DEFINED';
        configuration.columnPlan = null;
        configuration.columnDesigns = [];
        configuration.components = [];
        return;
      case 'category':
        if (configuration.category) {
          configuration.status = 'CATEGORY_SELECTED';
        }
        configuration.columnPlan = null;
        configuration.columnDesigns = [];
        configuration.components = [];
        return;
      case 'columnPlan':
        if (configuration.columnPlan) {
          configuration.status = 'COLUMNS_DEFINED';
        }
        configuration.components = [];
        return;
      case 'columnDesigns':
        configuration.status =
          configuration.columnDesigns.length > 0 ? 'DESIGN_IN_PROGRESS' : 'COLUMNS_DEFINED';
        return;
      default:
        // 'name' and other non-status-bearing fields leave status unchanged.
        return;
    }
  }

  private getActiveSession(sessionCode: string, configurationId: string): SessionState {
    const session = this.getActiveSessionByCode(sessionCode);

    if (session.configurationId !== configurationId) {
      throw new ResourceNotFoundError('Collaborative session does not match configuration');
    }

    return session;
  }

  private getActiveSessionByCode(sessionCode: string): SessionState {
    this.pruneExpiredSessions();

    const session = this.sessions.get(sessionCode);
    if (!session) {
      throw new ResourceNotFoundError('Collaborative session not found');
    }

    if (session.expiresAtMs <= this.now()) {
      this.sessions.delete(sessionCode);
      throw new SessionExpiredError('Collaborative session expired');
    }

    return session;
  }

  private touch(session: SessionState): void {
    session.expiresAtMs = this.now() + this.ttlMs;
  }

  private pruneExpiredSessions(): void {
    const nowMs = this.now();
    for (const [sessionCode, session] of this.sessions.entries()) {
      if (session.expiresAtMs <= nowMs) {
        this.sessions.delete(sessionCode);
      }
    }
  }

  private toOutput(session: SessionState): CollabSessionOutput {
    return {
      sessionCode: session.sessionCode,
      configurationId: session.configurationId,
      lamport: session.lamport,
      participants: [...session.participants].sort(),
      ttlSeconds: Math.floor(this.ttlMs / 1000),
      snapshot: this.cloneConfiguration(session.snapshot),
      ownerId: session.hostUserId,
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
