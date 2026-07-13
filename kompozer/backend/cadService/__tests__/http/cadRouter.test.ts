import request from 'supertest';
import { buildApp } from '../../src/app';
import {
  FakeCatalogRulesProvider,
  FakeCartServiceClient,
  FakeConfigurationRepository,
  buildConfiguration,
  buildCatalogRules,
} from '../helpers/fakes';

/** Integration-style tests for CAD HTTP routes and workflow transitions. */
describe('cadRouter', () => {
  it('GET /health -> 200', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /cad/configurations -> 200 and returns only owner configurations', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ id: 'cfg_1', ownerId: 'usr_1', status: 'DRAFT' }));
    repo.seed(buildConfiguration({ id: 'cfg_2', ownerId: 'usr_1', status: 'FINALIZED' }));
    repo.seed(buildConfiguration({ id: 'cfg_3', ownerId: 'usr_2', status: 'FINALIZED' }));

    const app = buildApp({
      configurationRepository: repo,
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const res = await request(app)
      .get('/cad/configurations?status=FINALIZED')
      .set('x-user-id', 'usr_1');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe('cfg_2');
    expect(res.body.items[0].ownerId).toBe('usr_1');
  });

  it('POST /cad/configurations -> 201 and PATCH commands finalize full flow', async () => {
    const cart = new FakeCartServiceClient();
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: cart,
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Scaffale soggiorno' });

    expect(created.status).toBe(201);
    const configurationId = created.body.id as string;

    const environment = await request(app)
      .patch(`/cad/configurations/${configurationId}/environment`)
      .set('x-user-id', 'usr_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    expect(environment.status).toBe(200);
    expect(environment.body.status).toBe('ENVIRONMENT_DEFINED');

    const category = await request(app)
      .patch(`/cad/configurations/${configurationId}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'TONDO' });

    expect(category.status).toBe(200);
    expect(category.body.status).toBe('CATEGORY_SELECTED');

    const columnPlan = await request(app)
      .patch(`/cad/configurations/${configurationId}/column-plan`)
      .set('x-user-id', 'usr_1')
      .send({
        columnCount: 2,
        columns: [
          { index: 0, shelfWidthMm: 800 },
          { index: 1, shelfWidthMm: 600 },
        ],
      });

    expect(columnPlan.status).toBe(200);
    expect(columnPlan.body.status).toBe('COLUMNS_DEFINED');

    const design = await request(app)
      .patch(`/cad/configurations/${configurationId}/design`)
      .set('x-user-id', 'usr_1')
      .send({
        columnDesigns: [
          { columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 },
          { columnIndex: 1, levelsMm: [], shelfThicknessMm: 20 },
        ],
      });

    expect(design.status).toBe(200);
    expect(design.body.status).toBe('READY_FOR_FINALIZE');

    const finalized = await request(app)
      .post(`/cad/configurations/${configurationId}/finalize`)
      .set('x-user-id', 'usr_1')
      .send({});

    expect(finalized.status).toBe(200);
    expect(finalized.body.status).toBe('FINALIZED');
    expect(finalized.body.bom).toBeDefined();
    expect(finalized.body.bom.length).toBeGreaterThan(0);
    expect(cart.calls).toHaveLength(1);

    const fetched = await request(app)
      .get(`/cad/configurations/${configurationId}`)
      .set('x-user-id', 'usr_1');

    expect(fetched.status).toBe(200);
    expect(fetched.body.environment.maxWidthMm).toBe(5000);
    expect(fetched.body.category).toBe('TONDO');
    expect(fetched.body.columnPlan.columns).toHaveLength(2);
    expect(fetched.body.columnDesigns).toHaveLength(2);
    expect(fetched.body.status).toBe('FINALIZED');
  });

  it('PATCH /cad/configurations/:id/category -> 409 when environment is missing', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Bozza senza setup' });

    const res = await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'TONDO' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
  });

  it('PATCH /cad/configurations/:id/category -> 200 for INTELLIGENTE', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Bozza intelligente' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/environment`)
      .set('x-user-id', 'usr_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    const res = await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'INTELLIGENTE' });

    expect(res.status).toBe(200);
    expect(res.body.category).toBe('INTELLIGENTE');
  });

  it('PATCH /cad/configurations/:id/design -> 422 on invalid payload', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Bozza' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/environment`)
      .set('x-user-id', 'usr_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'TONDO' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/column-plan`)
      .set('x-user-id', 'usr_1')
      .send({ columnCount: 1, columns: [{ index: 0, shelfWidthMm: 800 }] });

    const res = await request(app)
      .patch(`/cad/configurations/${created.body.id}/design`)
      .set('x-user-id', 'usr_1')
      .send({ columnDesigns: [{ columnIndex: 'bad', levelsMm: [420], shelfThicknessMm: 20 }] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /cad/configurations/:id/column-plan -> 422 when shelf width is unavailable in category', async () => {
    const rules = buildCatalogRules({
      shelfByWidthMm: new Map([[600, { type: 'RIPIANO', sku: 'RIP-600', name: 'Ripiano 600', priceCents: 2990, widthMm: 600, heightMm: 20, depthMm: 300 }]]),
    });
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(rules),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Bozza' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/environment`)
      .set('x-user-id', 'usr_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'TONDO' });

    const res = await request(app)
      .patch(`/cad/configurations/${created.body.id}/column-plan`)
      .set('x-user-id', 'usr_1')
      .send({ columnCount: 1, columns: [{ index: 0, shelfWidthMm: 800 }] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /cad/configurations/:id/design -> 422 on adjacent columns at same level', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Bozza' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/environment`)
      .set('x-user-id', 'usr_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'TONDO' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/column-plan`)
      .set('x-user-id', 'usr_1')
      .send({
        columnCount: 2,
        columns: [
          { index: 0, shelfWidthMm: 800 },
          { index: 1, shelfWidthMm: 600 },
        ],
      });

    const res = await request(app)
      .patch(`/cad/configurations/${created.body.id}/design`)
      .set('x-user-id', 'usr_1')
      .send({
        columnDesigns: [
          { columnIndex: 0, levelsMm: [420, 860], shelfThicknessMm: 20 },
          { columnIndex: 1, levelsMm: [520, 860], shelfThicknessMm: 20 },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /cad/configurations/:id/next-options -> 200 with backend-calculated options', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Bozza' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/environment`)
      .set('x-user-id', 'usr_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'TONDO' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/column-plan`)
      .set('x-user-id', 'usr_1')
      .send({
        columnCount: 2,
        columns: [
          { index: 0, shelfWidthMm: 800 },
          { index: 1, shelfWidthMm: 600 },
        ],
      });

    const res = await request(app)
      .get(`/cad/configurations/${created.body.id}/next-options?columnIndex=0`)
      .set('x-user-id', 'usr_1');

    expect(res.status).toBe(200);
    expect(res.body.columnIndex).toBe(0);
    expect(Array.isArray(res.body.options)).toBe(true);
    expect(res.body.options.length).toBeGreaterThan(0);
    expect(res.body.options.some((option: { allowed: boolean }) => option.allowed)).toBe(true);
    expect(typeof res.body.lookAhead?.feasible).toBe('boolean');
  });

  it('GET /cad/configurations/:id/next-options -> 501 for KUBE (logic not implemented yet)', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Bozza kube' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/environment`)
      .set('x-user-id', 'usr_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'KUBE' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/column-plan`)
      .set('x-user-id', 'usr_1')
      .send({
        columnCount: 1,
        columns: [{ index: 0, shelfWidthMm: 800 }],
      });

    const res = await request(app)
      .get(`/cad/configurations/${created.body.id}/next-options?columnIndex=0`)
      .set('x-user-id', 'usr_1');

    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('CATEGORY_LOGIC_NOT_IMPLEMENTED');
  });

  it('GET /cad/configurations/:id/next-options -> 422 for INTELLIGENTE (BORDO shelf not in fake catalog)', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Bozza intelligente' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/environment`)
      .set('x-user-id', 'usr_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'usr_1')
      .send({ category: 'INTELLIGENTE' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/column-plan`)
      .set('x-user-id', 'usr_1')
      .send({
        columnCount: 1,
        columns: [{ index: 0, shelfWidthMm: 800 }],
      });

    const res = await request(app)
      .get(`/cad/configurations/${created.body.id}/next-options?columnIndex=0`)
      .set('x-user-id', 'usr_1');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /cad/configurations/:id/collab/sessions -> 201 and join by code from another user', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Collaborative setup' });

    const opened = await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/sessions`)
      .set('x-user-id', 'usr_1')
      .send({});

    expect(opened.status).toBe(201);
    expect(typeof opened.body.sessionCode).toBe('string');
    expect(opened.body.sessionCode.length).toBe(6);
    expect(opened.body.participants).toEqual(['usr_1']);
    expect(opened.body.ownerId).toBe('usr_1');

    const sessionCode = opened.body.sessionCode as string;

    const joined = await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/join/${sessionCode}`)
      .set('x-user-id', 'usr_2')
      .send({});

    expect(joined.status).toBe(200);
    expect(joined.body.participants).toEqual(expect.arrayContaining(['usr_1', 'usr_2']));
    expect(joined.body.snapshot.id).toBe(created.body.id);
  });

  it('POST /cad/configurations/:id/collab/sessions/:code/operations -> applies Lamport/LWW and rejects stale baseVersion', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'usr_1')
      .send({ name: 'Draft name' });

    const opened = await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/sessions`)
      .set('x-user-id', 'usr_1')
      .send({});

    const sessionCode = opened.body.sessionCode as string;

    await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/join/${sessionCode}`)
      .set('x-user-id', 'usr_2')
      .send({});

    const applied = await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/sessions/${sessionCode}/operations`)
      .set('x-user-id', 'usr_2')
      .send({
        opId: 'op_1',
        lamport: 5,
        fieldPath: 'name',
        value: 'Name from usr_2',
        baseVersion: 1,
      });

    expect(applied.status).toBe(200);
    expect(applied.body.applied).toBe(true);
    expect(applied.body.snapshot.name).toBe('Name from usr_2');
    expect(applied.body.snapshot.version).toBe(2);

    const lowerLamport = await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/sessions/${sessionCode}/operations`)
      .set('x-user-id', 'usr_1')
      .send({
        opId: 'op_2',
        lamport: 4,
        fieldPath: 'name',
        value: 'Name from usr_1',
        baseVersion: 2,
      });

    expect(lowerLamport.status).toBe(200);
    expect(lowerLamport.body.applied).toBe(false);
    expect(lowerLamport.body.snapshot.name).toBe('Name from usr_2');

    const stale = await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/sessions/${sessionCode}/operations`)
      .set('x-user-id', 'usr_2')
      .send({
        opId: 'op_3',
        lamport: 8,
        fieldPath: 'name',
        value: 'stale update',
        baseVersion: 1,
      });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('COLLAB_OPERATION_STALE');
  });

  it('PATCH /cad/configurations/:id/category -> 200 for participant joined by code to collaborative session', async () => {
    const app = buildApp({
      configurationRepository: new FakeConfigurationRepository(),
      catalogRulesProvider: new FakeCatalogRulesProvider(),
      cartServiceClient: new FakeCartServiceClient(),
    });

    const created = await request(app)
      .post('/cad/configurations')
      .set('x-user-id', 'owner_1')
      .send({ name: 'Shared config' });

    await request(app)
      .patch(`/cad/configurations/${created.body.id}/environment`)
      .set('x-user-id', 'owner_1')
      .send({
        maxWidthMm: 5000,
        maxHeightMm: 3000,
        minWidthMm: 600,
        minHeightMm: 220,
        unit: 'mm',
      });

    const opened = await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/sessions`)
      .set('x-user-id', 'owner_1')
      .send({});

    const sessionCode = opened.body.sessionCode as string;

    await request(app)
      .post(`/cad/configurations/${created.body.id}/collab/join/${sessionCode}`)
      .set('x-user-id', 'collab_2')
      .send({});

    const category = await request(app)
      .patch(`/cad/configurations/${created.body.id}/category`)
      .set('x-user-id', 'collab_2')
      .set('x-collab-session-code', sessionCode)
      .send({ category: 'TONDO' });

    expect(category.status).toBe(200);
    expect(category.body.category).toBe('TONDO');
  });
});