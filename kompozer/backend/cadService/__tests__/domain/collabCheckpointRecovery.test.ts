import { InMemoryCollabSessionService } from '../../src/domain/services/InMemoryCollabSessionService';
import {
  CollabCheckpoint,
  CollabCheckpointStore,
} from '../../src/domain/ports/CollabCheckpointStore';
import {
  CollabEvent,
  CollabEventInput,
  CollabEventLog,
} from '../../src/domain/ports/CollabEventLog';
import { FakeConfigurationRepository, buildConfiguration } from '../helpers/fakes';

/**
 * Fake stable storage for checkpoints, mirroring the Mongo adapter semantics
 * (replace-by-sessionCode, load-all, delete-by-sessionCode).
 */
class FakeCheckpointStore implements CollabCheckpointStore {
  readonly checkpoints = new Map<string, CollabCheckpoint>();

  async saveCheckpoint(checkpoint: CollabCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.sessionCode, checkpoint);
  }

  async loadAllCheckpoints(): Promise<CollabCheckpoint[]> {
    return [...this.checkpoints.values()];
  }

  async deleteCheckpoint(sessionCode: string): Promise<void> {
    this.checkpoints.delete(sessionCode);
  }
}

/** Fake append-only event log with a monotonic per-session sequence. */
class FakeEventLog implements CollabEventLog {
  readonly events: CollabEvent[] = [];
  private readonly seqByCode = new Map<string, number>();

  async append(event: CollabEventInput): Promise<number> {
    const seq = (this.seqByCode.get(event.sessionCode) ?? 0) + 1;
    this.seqByCode.set(event.sessionCode, seq);
    this.events.push({ ...event, seq, appliedAt: new Date() });
    return seq;
  }

  async readSince(sessionCode: string, afterSeq: number): Promise<CollabEvent[]> {
    return this.events
      .filter((event) => event.sessionCode === sessionCode && event.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
      .map((event) => ({ ...event }));
  }

  async truncateUpTo(sessionCode: string, seq: number): Promise<void> {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const event = this.events[i];
      if (event.sessionCode === sessionCode && event.seq <= seq) {
        this.events.splice(i, 1);
      }
    }
  }

  async deleteForSession(sessionCode: string): Promise<void> {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      if (this.events[i].sessionCode === sessionCode) {
        this.events.splice(i, 1);
      }
    }
    this.seqByCode.delete(sessionCode);
  }

  countFor(sessionCode: string): number {
    return this.events.filter((event) => event.sessionCode === sessionCode).length;
  }
}

/**
 * Checkpoint + recovery tests for InMemoryCollabSessionService.
 *
 * Verifies the DS fault-tolerance requirement: after a crash the service can
 * reconstruct active sessions from the latest checkpoint plus the replay of the
 * events logged afterwards, converging to the exact pre-crash state.
 */
describe('InMemoryCollabSessionService — checkpoint, recovery & replay', () => {
  function makeStores() {
    return { checkpointStore: new FakeCheckpointStore(), eventLog: new FakeEventLog() };
  }

  function makeService(
    checkpointStore: FakeCheckpointStore,
    eventLog: FakeEventLog,
    clock: { ms: number },
  ) {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ id: 'cfg_1', ownerId: 'alice' }));
    const service = new InMemoryCollabSessionService(
      repo,
      60 * 60 * 1000,
      () => clock.ms,
      checkpointStore,
      eventLog,
    );
    return { service, repo };
  }

  it('persists an initial checkpoint on session creation', async () => {
    const { checkpointStore, eventLog } = makeStores();
    const clock = { ms: 1_000_000 };
    const { service } = makeService(checkpointStore, eventLog, clock);

    const session = await service.createSession({ configurationId: 'cfg_1', hostUserId: 'alice' });

    const checkpoint = checkpointStore.checkpoints.get(session.sessionCode);
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.hostUserId).toBe('alice');
    expect(checkpoint?.snapshot.version).toBe(1);
  });

  it('logs only applied operations as replayable events', async () => {
    const { checkpointStore, eventLog } = makeStores();
    const clock = { ms: 1_000_000 };
    const { service } = makeService(checkpointStore, eventLog, clock);
    const { sessionCode } = await service.createSession({ configurationId: 'cfg_1', hostUserId: 'alice' });
    await service.joinByCode({ sessionCode, userId: 'bob' });

    // Applied (higher Lamport wins).
    await service.applyOperation({
      sessionCode, configurationId: 'cfg_1', userId: 'bob',
      opId: 'op-1', lamport: 10, fieldPath: 'name', value: 'Bob', baseVersion: 1,
    });
    // Rejected by LWW (lower Lamport) — must NOT be logged.
    const rejected = await service.applyOperation({
      sessionCode, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-2', lamport: 3, fieldPath: 'name', value: 'Alice', baseVersion: 2,
    });

    expect(rejected.applied).toBe(false);
    expect(eventLog.countFor(sessionCode)).toBe(1);
  });

  it('recovers a session from checkpoint + replayed events after a crash', async () => {
    const { checkpointStore, eventLog } = makeStores();
    const clock = { ms: 1_000_000 };

    // ── Original instance ──
    const first = makeService(checkpointStore, eventLog, clock);
    const { sessionCode } = await first.service.createSession({ configurationId: 'cfg_1', hostUserId: 'alice' });
    await first.service.joinByCode({ sessionCode, userId: 'bob' });

    const r1 = await first.service.applyOperation({
      sessionCode, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-name', lamport: 3, fieldPath: 'name', value: 'Scaffale DS', baseVersion: 1,
    });
    expect(r1.applied).toBe(true);

    // Periodic checkpoint folds the name change into stable storage.
    await first.service.checkpointAllSessions();

    // A later edit is logged AFTER the checkpoint (only in the event log).
    const r2 = await first.service.applyOperation({
      sessionCode, configurationId: 'cfg_1', userId: 'bob',
      opId: 'op-cat', lamport: 5, fieldPath: 'category', value: 'TONDO', baseVersion: r1.snapshot.version,
    });
    expect(r2.applied).toBe(true);

    const preCrash = r2.snapshot;

    // ── Crash: brand-new instance sharing the same stable storage ──
    const second = makeService(checkpointStore, eventLog, clock);
    const recovered = await second.service.recoverSessions();
    expect(recovered).toContain(sessionCode);

    const restored = await second.service.getSnapshot({
      sessionCode, configurationId: 'cfg_1', userId: 'alice',
    });

    // Converges to the exact pre-crash state (checkpoint + replay).
    expect(restored.snapshot.name).toBe('Scaffale DS');
    expect(restored.snapshot.category).toBe('TONDO');
    expect(restored.snapshot.version).toBe(preCrash.version);
    expect(restored.ownerId).toBe('alice');
    expect(restored.participants).toEqual(expect.arrayContaining(['alice', 'bob']));
  });

  it('truncates events already folded into the latest checkpoint', async () => {
    const { checkpointStore, eventLog } = makeStores();
    const clock = { ms: 1_000_000 };
    const { service } = makeService(checkpointStore, eventLog, clock);
    const { sessionCode } = await service.createSession({ configurationId: 'cfg_1', hostUserId: 'alice' });

    await service.applyOperation({
      sessionCode, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-1', lamport: 2, fieldPath: 'name', value: 'First', baseVersion: 1,
    });
    expect(eventLog.countFor(sessionCode)).toBe(1);

    await service.checkpointAllSessions();
    // The event is now captured by the checkpoint snapshot and can be discarded.
    expect(eventLog.countFor(sessionCode)).toBe(0);
    expect(checkpointStore.checkpoints.get(sessionCode)?.snapshot.name).toBe('First');
  });

  it('cleans up checkpoint and events when the owner leaves', async () => {
    const { checkpointStore, eventLog } = makeStores();
    const clock = { ms: 1_000_000 };
    const { service } = makeService(checkpointStore, eventLog, clock);
    const { sessionCode } = await service.createSession({ configurationId: 'cfg_1', hostUserId: 'alice' });
    await service.applyOperation({
      sessionCode, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-1', lamport: 2, fieldPath: 'name', value: 'Doomed', baseVersion: 1,
    });

    await service.leaveSession({ sessionCode, configurationId: 'cfg_1', userId: 'alice' });

    expect(checkpointStore.checkpoints.has(sessionCode)).toBe(false);
    expect(eventLog.countFor(sessionCode)).toBe(0);
  });

  it('discards and cleans up expired checkpoints during recovery', async () => {
    const { checkpointStore, eventLog } = makeStores();
    const clock = { ms: 1_000_000 };

    const first = makeService(checkpointStore, eventLog, clock);
    const { sessionCode } = await first.service.createSession({ configurationId: 'cfg_1', hostUserId: 'alice' });

    // Advance the clock past the session TTL, then recover with a fresh instance.
    clock.ms += 2 * 60 * 60 * 1000;
    const second = makeService(checkpointStore, eventLog, clock);
    const recovered = await second.service.recoverSessions();

    expect(recovered).not.toContain(sessionCode);
    expect(checkpointStore.checkpoints.has(sessionCode)).toBe(false);
  });
});
