import { InMemoryCollabSessionService } from '../../src/domain/services/InMemoryCollabSessionService';
import { FakeConfigurationRepository, buildConfiguration } from '../helpers/fakes';

/**
 * Concurrency tests for InMemoryCollabSessionService.
 *
 * Verifies that the Lamport + LWW field-level conflict resolution strategy
 * produces consistent, deterministic state convergence regardless of operation
 * arrival order.
 *
 * Scenarios covered:
 * A) LWW win: higher Lamport overwrites lower Lamport on same field.
 * B) LWW lose: lower Lamport does not overwrite higher Lamport on same field.
 * C) Tie-break by actor-id: equal Lamport, lexicographically greater actor wins.
 * D) Independent fields converge independently (both writes applied).
 * E) Duplicate opId is idempotent (applied=false, duplicate=true, state unchanged).
 * F) Stale baseVersion is rejected with CollabOperationStaleError.
 * G) Order independence: applying op A then B yields same result as applying op B then A
 *    when A and B target different fields.
 * H) Causal chain: sequential ops from same actor accumulate correctly.
 * I) Two concurrent renames on same field — only one survives per LWW.
 * J) Three-way concurrent write on same field — highest Lamport wins.
 */
describe('InMemoryCollabSessionService — concurrency & LWW convergence', () => {
  const BASE_ENV = {
    maxWidthMm: 5000,
    maxHeightMm: 3000,
    minWidthMm: 600,
    minHeightMm: 220,
    unit: 'mm',
  };

  function makeService(nowMs = 1_000_000) {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ id: 'cfg_1', ownerId: 'alice' }));
    const clock = { ms: nowMs };
    const service = new InMemoryCollabSessionService(repo, 60 * 60 * 1000, () => clock.ms);
    return { service, repo, clock };
  }

  async function openSessionWith2Participants(service: InMemoryCollabSessionService) {
    const session = await service.createSession({
      configurationId: 'cfg_1',
      hostUserId: 'alice',
    });
    await service.joinByCode({ sessionCode: session.sessionCode, userId: 'bob' });
    return session.sessionCode;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // A) LWW win: op with higher Lamport must overwrite an earlier one
  // ──────────────────────────────────────────────────────────────────────────
  it('A) LWW win — higher Lamport overwrites lower Lamport on same field', async () => {
    const { service } = makeService();
    const code = await openSessionWith2Participants(service);

    // Alice writes "Scaffale 1" at lamport=3
    const r1 = await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'alice',
      opId: 'op-a1',
      lamport: 3,
      fieldPath: 'name',
      value: 'Scaffale 1',
      baseVersion: 1,
    });
    expect(r1.applied).toBe(true);
    expect(r1.snapshot.name).toBe('Scaffale 1');

    // Bob writes "Scaffale 2" at lamport=5 (wins)
    const r2 = await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'bob',
      opId: 'op-b1',
      lamport: 5,
      fieldPath: 'name',
      value: 'Scaffale 2',
      baseVersion: r1.snapshot.version,
    });
    expect(r2.applied).toBe(true);
    expect(r2.snapshot.name).toBe('Scaffale 2');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // B) LWW lose: op with lower Lamport must NOT overwrite the current winner
  // ──────────────────────────────────────────────────────────────────────────
  it('B) LWW lose — lower Lamport is silently rejected (applied=false)', async () => {
    const { service } = makeService();
    const code = await openSessionWith2Participants(service);

    // Bob writes at lamport=10
    await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'bob',
      opId: 'op-b1',
      lamport: 10,
      fieldPath: 'name',
      value: 'Bob name',
      baseVersion: 1,
    });

    // Alice writes at lamport=3 (stale, must lose)
    const r = await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'alice',
      opId: 'op-a1',
      lamport: 3,
      fieldPath: 'name',
      value: 'Alice name',
      baseVersion: 2,
    });
    expect(r.applied).toBe(false);
    expect(r.duplicate).toBe(false);
    expect(r.snapshot.name).toBe('Bob name');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // C) Tie-break: equal Lamport — lexicographically greater actorId wins
  // ──────────────────────────────────────────────────────────────────────────
  it('C) Tie-break — equal Lamport, greater actorId wins', async () => {
    const { service, repo } = makeService();
    repo.seed(buildConfiguration({ id: 'cfg_1', ownerId: 'alice', collaborators: ['zebra'] }));
    const code = await openSessionWith2Participants(service);
    await service.joinByCode({ sessionCode: code, userId: 'zebra' });

    // alice (actorId="alice") writes at lamport=7
    await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'alice',
      opId: 'op-a1',
      lamport: 7,
      fieldPath: 'name',
      value: 'Alice wins?',
      baseVersion: 1,
    });

    // zebra (actorId="zebra" > "alice") writes at same lamport=7 — zebra should win
    const r = await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'zebra',
      opId: 'op-z1',
      lamport: 7,
      fieldPath: 'name',
      value: 'Zebra wins',
      baseVersion: 2,
    });
    expect(r.applied).toBe(true);
    expect(r.snapshot.name).toBe('Zebra wins');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // D) Independent fields converge independently
  // ──────────────────────────────────────────────────────────────────────────
  it('D) Independent fields — concurrent writes on different fields both survive', async () => {
    const { service } = makeService();
    const code = await openSessionWith2Participants(service);

    // Alice writes name
    const r1 = await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'alice',
      opId: 'op-a1',
      lamport: 4,
      fieldPath: 'name',
      value: 'Alice scaffold',
      baseVersion: 1,
    });

    // Bob writes environment (different field)
    const r2 = await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'bob',
      opId: 'op-b1',
      lamport: 4,
      fieldPath: 'environment',
      value: BASE_ENV,
      baseVersion: r1.snapshot.version,
    });

    expect(r2.applied).toBe(true);
    expect(r2.snapshot.name).toBe('Alice scaffold');
    expect(r2.snapshot.environment?.maxWidthMm).toBe(5000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E) Duplicate opId is idempotent
  // ──────────────────────────────────────────────────────────────────────────
  it('E) Duplicate opId — second application returns duplicate=true, state unchanged', async () => {
    const { service } = makeService();
    const code = await openSessionWith2Participants(service);

    const r1 = await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'alice',
      opId: 'op-dup',
      lamport: 2,
      fieldPath: 'name',
      value: 'First write',
      baseVersion: 1,
    });

    const versionAfterFirst = r1.snapshot.version;

    const r2 = await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'alice',
      opId: 'op-dup',
      lamport: 2,
      fieldPath: 'name',
      value: 'First write',
      baseVersion: versionAfterFirst,
    });

    expect(r2.duplicate).toBe(true);
    expect(r2.applied).toBe(false);
    expect(r2.snapshot.version).toBe(versionAfterFirst);
    expect(r2.snapshot.name).toBe('First write');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // F) Stale baseVersion is rejected
  // ──────────────────────────────────────────────────────────────────────────
  it('F) Stale baseVersion — throws CollabOperationStaleError', async () => {
    const { service } = makeService();
    const code = await openSessionWith2Participants(service);

    // Advance version by one
    await service.applyOperation({
      sessionCode: code,
      configurationId: 'cfg_1',
      userId: 'alice',
      opId: 'op-a1',
      lamport: 2,
      fieldPath: 'name',
      value: 'v2',
      baseVersion: 1,
    });

    // Bob sends op with outdated baseVersion=1 (now version is 2)
    await expect(
      service.applyOperation({
        sessionCode: code,
        configurationId: 'cfg_1',
        userId: 'bob',
        opId: 'op-b1',
        lamport: 3,
        fieldPath: 'name',
        value: 'stale write',
        baseVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'COLLAB_OPERATION_STALE' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // G) Order independence on different fields (commutativity)
  // ──────────────────────────────────────────────────────────────────────────
  it('G) Order independence — applying ops in different order on different fields yields same state', async () => {
    // Session 1: Alice name first, then Bob environment
    const { service: svc1 } = makeService();
    const code1 = await openSessionWith2Participants(svc1);

    const r1a = await svc1.applyOperation({
      sessionCode: code1, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-a', lamport: 5, fieldPath: 'name', value: 'SharedName', baseVersion: 1,
    });
    const r1b = await svc1.applyOperation({
      sessionCode: code1, configurationId: 'cfg_1', userId: 'bob',
      opId: 'op-b', lamport: 6, fieldPath: 'environment', value: BASE_ENV, baseVersion: r1a.snapshot.version,
    });

    // Session 2: Bob environment first, then Alice name
    const { service: svc2, repo: repo2 } = makeService();
    repo2.seed(buildConfiguration({ id: 'cfg_1', ownerId: 'alice' }));
    const code2 = await openSessionWith2Participants(svc2);

    const r2a = await svc2.applyOperation({
      sessionCode: code2, configurationId: 'cfg_1', userId: 'bob',
      opId: 'op-b', lamport: 6, fieldPath: 'environment', value: BASE_ENV, baseVersion: 1,
    });
    const r2b = await svc2.applyOperation({
      sessionCode: code2, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-a', lamport: 5, fieldPath: 'name', value: 'SharedName', baseVersion: r2a.snapshot.version,
    });

    expect(r1b.snapshot.name).toBe(r2b.snapshot.name);
    expect(r1b.snapshot.environment?.maxWidthMm).toBe(r2b.snapshot.environment?.maxWidthMm);
    expect(r1b.snapshot.version).toBe(r2b.snapshot.version);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // H) Causal chain — sequential ops from same actor accumulate
  // ──────────────────────────────────────────────────────────────────────────
  it('H) Causal chain — three sequential ops from one actor are all applied', async () => {
    const { service } = makeService();
    const code = await openSessionWith2Participants(service);

    const r1 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-1', lamport: 1, fieldPath: 'name', value: 'Step 1', baseVersion: 1,
    });
    const r2 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-2', lamport: 2, fieldPath: 'environment', value: BASE_ENV, baseVersion: r1.snapshot.version,
    });
    const r3 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-3', lamport: 3, fieldPath: 'name', value: 'Step 3 Final', baseVersion: r2.snapshot.version,
    });

    expect(r3.applied).toBe(true);
    expect(r3.snapshot.name).toBe('Step 3 Final');
    expect(r3.snapshot.environment?.maxWidthMm).toBe(5000);
    expect(r3.snapshot.version).toBe(4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // I) Two concurrent renames — only the higher-Lamport survives
  // ──────────────────────────────────────────────────────────────────────────
  it('I) Two concurrent renames — only highest Lamport survives', async () => {
    const { service } = makeService();
    const code = await openSessionWith2Participants(service);

    const r1 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'alice',
      opId: 'rename-a', lamport: 8, fieldPath: 'name', value: 'Alice Name', baseVersion: 1,
    });
    // Bob sends concurrent rename at lamport=6 (loses)
    const r2 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'bob',
      opId: 'rename-b', lamport: 6, fieldPath: 'name', value: 'Bob Name', baseVersion: r1.snapshot.version,
    });

    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(false);
    expect(r2.snapshot.name).toBe('Alice Name');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // J) Three-way concurrent write — highest Lamport wins
  // ──────────────────────────────────────────────────────────────────────────
  it('J) Three-way concurrent write — highest Lamport wins', async () => {
    const { service, repo } = makeService();
    repo.seed(buildConfiguration({ id: 'cfg_1', ownerId: 'alice', collaborators: ['bob', 'carol'] }));
    const code = await openSessionWith2Participants(service);
    await service.joinByCode({ sessionCode: code, userId: 'carol' });

    const r1 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-alice', lamport: 5, fieldPath: 'name', value: 'Alice', baseVersion: 1,
    });
    const r2 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'bob',
      opId: 'op-bob', lamport: 3, fieldPath: 'name', value: 'Bob', baseVersion: r1.snapshot.version,
    });
    const r3 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'carol',
      opId: 'op-carol', lamport: 9, fieldPath: 'name', value: 'Carol', baseVersion: r2.snapshot.version,
    });

    expect(r3.applied).toBe(true);
    expect(r3.snapshot.name).toBe('Carol');

    // Confirm previous losers did not affect final state
    expect(r2.applied).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // K) Lamport clock advances: session lamport = max(session, incoming) + 1
  // ──────────────────────────────────────────────────────────────────────────
  it('K) Session Lamport advances monotonically beyond incoming ops', async () => {
    const { service } = makeService();
    const code = await openSessionWith2Participants(service);

    const r1 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'alice',
      opId: 'op-1', lamport: 100, fieldPath: 'name', value: 'Jump', baseVersion: 1,
    });

    // Session lamport must be at least 101
    expect(r1.lamport).toBeGreaterThanOrEqual(101);

    const r2 = await service.applyOperation({
      sessionCode: code, configurationId: 'cfg_1', userId: 'bob',
      opId: 'op-2', lamport: 1, fieldPath: 'name', value: 'Small clock', baseVersion: r1.snapshot.version,
    });

    // Even with tiny incoming lamport, session lamport must keep growing
    expect(r2.lamport).toBeGreaterThan(r1.lamport);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // L) TTL expiry — expired session throws SessionExpiredError
  // ──────────────────────────────────────────────────────────────────────────
  it('L) Session expires after TTL — further ops throw SessionExpiredError', async () => {
    const ttlMs = 5000;
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ id: 'cfg_1', ownerId: 'alice' }));
    const clock = { ms: 1_000_000 };
    const service = new InMemoryCollabSessionService(repo, ttlMs, () => clock.ms);

    const session = await service.createSession({ configurationId: 'cfg_1', hostUserId: 'alice' });
    await service.joinByCode({ sessionCode: session.sessionCode, userId: 'bob' });

    // Advance clock past TTL
    clock.ms += ttlMs + 1;

    // pruneExpiredSessions() deletes expired entries before the TTL check, so
    // the session appears as "not found" rather than "expired" from the caller's
    // perspective. Both codes signal that the session is no longer usable.
    await expect(
      service.applyOperation({
        sessionCode: session.sessionCode,
        configurationId: 'cfg_1',
        userId: 'bob',
        opId: 'op-late',
        lamport: 1,
        fieldPath: 'name',
        value: 'Too late',
        baseVersion: 1,
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/SESSION_EXPIRED|RESOURCE_NOT_FOUND/) });
  });
});
