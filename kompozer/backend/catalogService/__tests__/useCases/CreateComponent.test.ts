import { CreateComponent }      from '../../src/useCases/CreateComponent';
import { FakeComponentRepository, FakeClock, FakeIdGenerator } from '../helpers/fakes';
import { ComponentCategory }   from '../../src/domain/entities/ComponentCategory';
import { ComponentType }       from '../../src/domain/entities/ComponentType';
import { ValidationError } from '../../src/domain/entities/errors';
import { CreateComponentInput } from '../../src/useCases/types';

const BASE_INPUT: CreateComponentInput = {
  name:            'Ripiano 80cm',
  description:     'Ripiano in legno 80x30',
  category:        ComponentCategory.TONDO,
  Type:            ComponentType.RIPIANO,
  price:           1990,
  isAvailable:     true,
  imageUrl:        'https://cdn.kompo.it/shelf.jpg',
  dimensions:      { widthMm: 800, heightMm: 20, depthMm: 300 },
  compatibleWith:  ['KMP-COL-001'],
  requestingUserId: 'admin-001',
};

function makeUseCase() {
  const repo  = new FakeComponentRepository();
  const clock = new FakeClock();
  const idGen = new FakeIdGenerator('comp');
  const uc    = new CreateComponent(repo, clock, idGen);
  return { repo, clock, idGen, uc };
}

describe('CreateComponent', () => {
  it('crea un componente con i dati corretti e genera lo SKU da category/Type/dimensions', async () => {
    const { repo, uc } = makeUseCase();
    const dto = await uc.execute(BASE_INPUT);

    expect(dto.sku).toBe('TONDO-SKU-RIPIANO-800x300');
    expect(dto.name).toBe('Ripiano 80cm');
    expect(dto.price).toBe(1990);
    expect(dto.version).toBe(1);
    expect(repo.size()).toBe(1);
  });

  it('assegna un ID univoco via IdGenerator', async () => {
    const { uc } = makeUseCase();
    const dto = await uc.execute(BASE_INPUT);
    expect(dto.id).toBe('comp-001');
  });

  it('aggiunge un suffisso numerico se lo SKU generato esiste già', async () => {
    const { repo, uc } = makeUseCase();
    await repo.save({
      ...BASE_INPUT,
      sku: 'TONDO-SKU-RIPIANO-800x300',
      id: 'existing',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const dto = await uc.execute(BASE_INPUT);
    expect(dto.sku).toBe('TONDO-SKU-RIPIANO-800x300-2');
  });

  it('incrementa il suffisso finché non trova uno SKU libero', async () => {
    const { repo, uc } = makeUseCase();
    for (const sku of ['TONDO-SKU-RIPIANO-800x300', 'TONDO-SKU-RIPIANO-800x300-2']) {
      await repo.save({
        ...BASE_INPUT,
        sku,
        id: `existing-${sku}`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const dto = await uc.execute(BASE_INPUT);
    expect(dto.sku).toBe('TONDO-SKU-RIPIANO-800x300-3');
  });

  it('lancia ValidationError se name è vuoto', async () => {
    const { uc } = makeUseCase();
    await expect(uc.execute({ ...BASE_INPUT, name: '' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('lancia ValidationError se price è negativo', async () => {
    const { uc } = makeUseCase();
    await expect(uc.execute({ ...BASE_INPUT, price: -1 }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('trunca price a intero (floor)', async () => {
    const { uc } = makeUseCase();
    const dto = await uc.execute({ ...BASE_INPUT, price: 19.99 });
    expect(dto.price).toBe(19);
  });

  it('usa il timestamp del clock', async () => {
    const { clock, uc } = makeUseCase();
    const fixedDate = new Date('2025-06-01T12:00:00.000Z');
    clock.setNow(fixedDate);

    const dto = await uc.execute(BASE_INPUT);
    expect(dto.createdAt).toBe(fixedDate.toISOString());
    expect(dto.updatedAt).toBe(fixedDate.toISOString());
  });

  it('compatibleWith default a [] se non fornito', async () => {
    const { uc } = makeUseCase();
    const { compatibleWith: _, ...withoutCompat } = BASE_INPUT;
    const dto = await uc.execute({ ...withoutCompat, compatibleWith: [] });
    expect(dto.compatibleWith).toEqual([]);
  });
});
