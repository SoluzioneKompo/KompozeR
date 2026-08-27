import request from 'supertest';
import express  from 'express';
import { buildCatalogRouter } from '../../src/adapters/http/catalogRouter';
import { errorMiddleware }    from '../../src/adapters/http/errorMiddleware';
import {
  FakeComponentRepository,
  FakeCatalogEventPublisher,
  FakeClock,
  FakeIdGenerator,
  makeComponent,
} from '../helpers/fakes';
import { ListComponents }    from '../../src/useCases/ListComponents';
import { GetComponent }      from '../../src/useCases/GetComponent';
import { CreateComponent }   from '../../src/useCases/CreateComponent';
import { UpdateComponent }   from '../../src/useCases/UpdateComponent';
import { DeleteComponent }   from '../../src/useCases/DeleteComponent';
import { ComponentCategory } from '../../src/domain/entities/ComponentCategory';
import { ComponentType }     from '../../src/domain/entities/ComponentType';

// ─── Builder ─────────────────────────────────────────────────────────────────

function buildApp() {
  const repo      = new FakeComponentRepository();
  const publisher = new FakeCatalogEventPublisher();
  const clock     = new FakeClock();
  const idGen     = new FakeIdGenerator('comp');
  const eventIdGen = new FakeIdGenerator('evt');

  const listComponents  = new ListComponents(repo);
  const getComponent    = new GetComponent(repo);
  const createComponent = new CreateComponent(repo, clock, idGen);
  const updateComponent = new UpdateComponent(repo, publisher, clock, eventIdGen);
  const deleteComponent = new DeleteComponent(repo);

  const app = express();
  app.use(express.json());
  app.use('/catalog', buildCatalogRouter({
    listComponents,
    getComponent,
    createComponent,
    updateComponent,
    deleteComponent,
  }));
  app.use(errorMiddleware);

  return { app, repo, publisher };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const VALID_BODY = {
  sku:            'KMP-SHELF-001',
  name:           'Ripiano 80cm',
  description:    'Ripiano in legno',
  category:       ComponentCategory.TONDO,
  Type:           ComponentType.RIPIANO,
  price:          1990,
  isAvailable:    true,
  imageUrl:       'https://cdn.kompo.it/shelf.jpg',
  dimensions:     { widthMm: 800, heightMm: 20, depthMm: 300 },
  compatibleWith: [],
};

describe('GET /catalog', () => {
  it('200 — lista vuota', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/catalog');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('totalPages');
  });

  it('200 — restituisce i componenti presenti', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1', sku: 'SKU-A' }));
    await repo.save(makeComponent({ id: 'c2', sku: 'SKU-B' }));

    const res = await request(app).get('/catalog');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it('200 — filtra per categoria via query string', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1', sku: 'SKU-A', category: ComponentCategory.TONDO }));
    await repo.save(makeComponent({ id: 'c2', sku: 'SKU-B', category: ComponentCategory.QUADRO }));

    const res = await request(app).get('/catalog?category=TONDO');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].category).toBe('TONDO');
  });

  it('200 — filtra per categoria INTELLIGENTE via query string', async () => {
    const { app, repo } = buildApp();
    await repo.save(
      makeComponent({ id: 'c1', sku: 'SKU-I', category: ComponentCategory.INTELLIGENTE }),
    );
    await repo.save(makeComponent({ id: 'c2', sku: 'SKU-T', category: ComponentCategory.TONDO }));

    const res = await request(app).get('/catalog?category=INTELLIGENTE');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].category).toBe('INTELLIGENTE');
  });

  it('200 — filtra per available=true', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1', sku: 'SKU-A', isAvailable: true }));
    await repo.save(makeComponent({ id: 'c2', sku: 'SKU-B', isAvailable: false }));

    const res = await request(app).get('/catalog?available=true');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });
});

describe('GET /catalog/:id', () => {
  it('200 — restituisce il componente', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1', sku: 'SKU-A' }));

    const res = await request(app).get('/catalog/c1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('c1');
    expect(res.body.sku).toBe('SKU-A');
  });

  it('404 — componente non trovato', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/catalog/non-esiste');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error.code', 'COMPONENT_NOT_FOUND');
  });
});

describe('POST /catalog — richiede ADMIN', () => {
  it('403 — senza header X-User-Role', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/catalog').send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('403 — con ruolo BASE', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'BASE')
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('201 — crea il componente con ruolo ADMIN', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.sku).toBe('KMP-SHELF-001');
    expect(res.body.version).toBe(1);
  });

  it('409 — SKU duplicato', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'existing', sku: 'KMP-SHELF-001' }));

    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error.code', 'DUPLICATE_SKU');
  });

  it('422 — dati non validi (name vuoto)', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ ...VALID_BODY, name: '' });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
  });

  it('422 — category non valida (fuori dall\'enum) invece di essere salvata sporca', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ ...VALID_BODY, category: 'NOT_A_REAL_CATEGORY' });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
  });

  it('422 — isAvailable con tipo sbagliato', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ ...VALID_BODY, isAvailable: 'yes' });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
  });

  it('422 — dimensions con forma malformata', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ ...VALID_BODY, dimensions: { widthMm: 'wide' } });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
  });

  it('422 — campi sconosciuti nel body (mass-assignment)', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ ...VALID_BODY, requestingUserId: 'spoofed-admin' });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
  });

  it('400 — JSON sintatticamente non valido', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/catalog')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error.code', 'INVALID_REQUEST');
  });
});

describe('PUT /catalog/:id — richiede ADMIN', () => {
  it('403 — senza ruolo ADMIN', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1' }));

    const res = await request(app)
      .put('/catalog/c1')
      .set('x-user-role', 'BASE')
      .send({ expectedVersion: 1, name: 'Nuovo' });
    expect(res.status).toBe(403);
  });

  it('200 — aggiorna il componente', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1', version: 1 }));

    const res = await request(app)
      .put('/catalog/c1')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ expectedVersion: 1, name: 'Nome aggiornato' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nome aggiornato');
    expect(res.body.version).toBe(2);
  });

  it('404 — componente non trovato', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .put('/catalog/non-esiste')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ expectedVersion: 1 });
    expect(res.status).toBe(404);
  });

  it('[DS] 409 — version conflict', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1', version: 5 }));

    const res = await request(app)
      .put('/catalog/c1')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ expectedVersion: 1, name: 'x' });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error.code', 'VERSION_CONFLICT');
  });

  it('422 — expectedVersion con tipo sbagliato (prima diventava un falso VERSION_CONFLICT)', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1', version: 1 }));

    const res = await request(app)
      .put('/catalog/c1')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001')
      .send({ expectedVersion: '1', name: 'x' });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
  });
});

describe('DELETE /catalog/:id — richiede ADMIN', () => {
  it('403 — senza ruolo ADMIN', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1' }));

    const res = await request(app)
      .delete('/catalog/c1')
      .set('x-user-role', 'BASE');
    expect(res.status).toBe(403);
  });

  it('204 — elimina il componente', async () => {
    const { app, repo } = buildApp();
    await repo.save(makeComponent({ id: 'c1' }));

    const res = await request(app)
      .delete('/catalog/c1')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001');
    expect(res.status).toBe(204);
    expect(repo.size()).toBe(0);
  });

  it('404 — componente non trovato', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .delete('/catalog/non-esiste')
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'admin-001');
    expect(res.status).toBe(404);
  });
});

describe('GET /catalog/health', () => {
  it('200 — health check', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/catalog/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});
