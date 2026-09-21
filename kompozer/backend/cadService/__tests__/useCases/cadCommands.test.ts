import { CreateConfiguration } from '../../src/useCases/write/CreateConfiguration';
import { FinalizeConfiguration } from '../../src/useCases/write/FinalizeConfiguration';
import { ReorderConfiguration } from '../../src/useCases/write/ReorderConfiguration';
import { ResetConfiguration } from '../../src/useCases/write/ResetConfiguration';
import { SetCategory } from '../../src/useCases/write/SetCategory';
import { SetDepth } from '../../src/useCases/write/SetDepth';
import { SetColumnPlan } from '../../src/useCases/write/SetColumnPlan';
import { ListNextOptions } from '../../src/useCases/read/ListNextOptions';
import { UpdateDesign } from '../../src/useCases/write/UpdateDesign';
import { deriveBom } from '../../src/domain/services/deriveBom';
import {
  FakeCatalogRulesProvider,
  FakeCartServiceClient,
  FakeNotificationSubscriptionClient,
  FakeConfigurationRepository,
  buildCatalogRules,
  buildConfiguration,
} from '../helpers/fakes';

/** Unit tests covering command-side CAD workflow use cases. */
describe('CAD command use cases', () => {
  it('CreateConfiguration creates a draft step-based configuration', async () => {
    const repo = new FakeConfigurationRepository();
    const useCase = new CreateConfiguration(repo);

    const result = await useCase.execute({ ownerId: 'usr_1', name: 'Bozza CAD' });

    expect(result.ownerId).toBe('usr_1');
    expect(result.status).toBe('DRAFT');
    expect(result.columnPlan).toBeNull();
    expect(result.columnDesigns).toEqual([]);
    expect(result.version).toBe(1);
  });

  it('FinalizeConfiguration marks configuration as FINALIZED and pushes BOM to cart', async () => {
    const repo = new FakeConfigurationRepository();
    const cart = new FakeCartServiceClient();
    const subscriptions = new FakeNotificationSubscriptionClient();
    repo.seed(
      buildConfiguration({
        status: 'DESIGN_IN_PROGRESS',
        category: 'TONDO',
        columnPlan: {
          columnCount: 2,
          columns: [
            { index: 0, shelfWidthMm: 800 },
            { index: 1, shelfWidthMm: 600 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 },
          { columnIndex: 1, levelsMm: [300, 640], shelfThicknessMm: 20 },
        ],
        components: [
          { sku: 'RIP-800', name: 'Ripiano 800', quantity: 2, unitPriceCents: 3490, componentType: 'RIPIANO' },
          { sku: 'PIE-120', name: 'Piedino', quantity: 8, unitPriceCents: 490, componentType: 'PIEDINO' },
        ],
      }),
    );

    const useCase = new FinalizeConfiguration(repo, cart, subscriptions);
    const result = await useCase.execute({ id: 'cfg_test', ownerId: 'usr_1' });

    expect(result.status).toBe('FINALIZED');
    expect(result.version).toBe(2);
    expect(result.bom).toBeDefined();
    expect(result.bom!.length).toBeGreaterThan(0);
    expect(cart.calls).toHaveLength(1);
    expect(cart.calls[0].ownerId).toBe('usr_1');
    expect(cart.calls[0].items.length).toBeGreaterThan(0);
    expect(subscriptions.calls).toHaveLength(2);
    expect(subscriptions.calls[0].ownerId).toBe('usr_1');
    expect(subscriptions.calls.map((call) => call.sku).sort()).toEqual(['PIE-120', 'RIP-800']);
  });

  it('ReorderConfiguration repushes BOM to cart without changing state', async () => {
    const repo = new FakeConfigurationRepository();
    const cart = new FakeCartServiceClient();
    repo.seed(
      buildConfiguration({
        status: 'FINALIZED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
        columnDesigns: [
          { columnIndex: 0, levelsMm: [120], shelfThicknessMm: 20 },
        ],
        components: [
          { sku: 'RIP-800', name: 'Ripiano 800', quantity: 1, unitPriceCents: 3490, componentType: 'RIPIANO' },
        ],
        version: 3,
      }),
    );

    const useCase = new ReorderConfiguration(repo, cart);
    const result = await useCase.execute({ id: 'cfg_test', ownerId: 'usr_1' });

    expect(result.status).toBe('FINALIZED');
    expect(result.version).toBe(3); // version unchanged
    expect(cart.calls).toHaveLength(1);
    expect(cart.calls[0].ownerId).toBe('usr_1');
    expect(cart.calls[0].items[0].sku).toBe('RIP-800');
  });

  it('ReorderConfiguration rejects non-finalized configurations', async () => {
    const repo = new FakeConfigurationRepository();
    const cart = new FakeCartServiceClient();
    repo.seed(buildConfiguration({ status: 'DESIGN_IN_PROGRESS' }));

    const useCase = new ReorderConfiguration(repo, cart);
    await expect(
      useCase.execute({ id: 'cfg_test', ownerId: 'usr_1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('UpdateDesign rejects unknown column indexes', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());

    await expect(
      useCase.execute({
        id: 'cfg_test',
        ownerId: 'usr_1',
        columnDesigns: [{ columnIndex: 99, levelsMm: [420], shelfThicknessMm: 20 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('SetColumnPlan stores the selected columns and advances to COLUMNS_DEFINED', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'CATEGORY_SELECTED',
        category: 'TONDO',
      }),
    );

    const useCase = new SetColumnPlan(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnPlan: {
        columnCount: 2,
        columns: [
          { index: 0, shelfWidthMm: 800 },
          { index: 1, shelfWidthMm: 600 },
        ],
      },
    });

    expect(result.status).toBe('COLUMNS_DEFINED');
    expect(result.columnPlan?.columns).toHaveLength(2);
  });

  it('SetColumnPlan rejects shelf widths not available for selected category', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'CATEGORY_SELECTED',
        category: 'TONDO',
      }),
    );

    const catalog = new FakeCatalogRulesProvider(buildCatalogRules({
      shelfByWidthMm: new Map([[600, { type: 'RIPIANO', sku: 'RIP-600', name: 'Ripiano 600', priceCents: 2990, widthMm: 600, heightMm: 20, depthMm: 300 }]]),
    }));

    const useCase = new SetColumnPlan(repo, catalog);

    await expect(
      useCase.execute({
        id: 'cfg_test',
        ownerId: 'usr_1',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('UpdateDesign rejects adjacent designs when the shared spine would require an invalid segment', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 2,
          columns: [
            { index: 0, shelfWidthMm: 800 },
            { index: 1, shelfWidthMm: 600 },
          ],
        },
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());

    await expect(
      useCase.execute({
        id: 'cfg_test',
        ownerId: 'usr_1',
        columnDesigns: [
          { columnIndex: 0, levelsMm: [420, 860], shelfThicknessMm: 20 },
          { columnIndex: 1, levelsMm: [520, 860], shelfThicknessMm: 20 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('UpdateDesign rejects equal levels in adjacent columns', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 2,
          columns: [
            { index: 0, shelfWidthMm: 800 },
            { index: 1, shelfWidthMm: 600 },
          ],
        },
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());

    await expect(
      useCase.execute({
        id: 'cfg_test',
        ownerId: 'usr_1',
        columnDesigns: [
          { columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 },
          { columnIndex: 1, levelsMm: [120, 440], shelfThicknessMm: 20 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('UpdateDesign rejects non increasing levels in the same column', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());

    await expect(
      useCase.execute({
        id: 'cfg_test',
        ownerId: 'usr_1',
        columnDesigns: [{ columnIndex: 0, levelsMm: [420, 420], shelfThicknessMm: 20 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('UpdateDesign normalizes client shelf thickness to the fixed 20mm value', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 999 }],
    });

    expect(result.columnDesigns[0].shelfThicknessMm).toBe(20);
  });

  it('SetCategory initializes components to empty array', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration());

    const useCase = new SetCategory(repo);
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      category: 'TONDO',
    });

    expect(result.bom).toEqual([]);
  });

  it('SetColumnPlan initializes components to empty array', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'CATEGORY_SELECTED',
        category: 'TONDO',
      }),
    );

    const useCase = new SetColumnPlan(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnPlan: {
        columnCount: 1,
        columns: [{ index: 0, shelfWidthMm: 800 }],
      },
    });

    expect(result.bom).toEqual([]);
  });

  it('UpdateDesign derives and persists components when design is complete', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
    });

    expect(result.bom!.length).toBeGreaterThan(0);
    expect(result.status).toBe('READY_FOR_FINALIZE');
    // Verify specific components were derived
    const skus = result.bom!.map((c) => c.sku);
    expect(skus).toContain('RIP-800'); // Ripiano
    expect(skus.some((s) => s.startsWith('MON-'))).toBe(true); // Montante
  });

  it('ListNextOptions proposes the second level using lastLevel + 20 + gap', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'DESIGN_IN_PROGRESS',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
        columnDesigns: [{ columnIndex: 0, levelsMm: [120], shelfThicknessMm: 20 }],
      }),
    );

    const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnIndex: 0,
    });

    const allowedHeights = result.options.filter((option) => option.allowed).map((option) => option.heightMm);
    expect(allowedHeights).toContain(300);
    expect(allowedHeights).not.toContain(280);
  });

  it('ListNextOptions falls back to upright heights when no foot heights are available', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const useCase = new ListNextOptions(
      repo,
      new FakeCatalogRulesProvider(buildCatalogRules({
        footHeightsMm: [],
        uprightHeightsMm: [120, 300, 400],
      })),
    );

    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnIndex: 0,
    });

    expect(result.options.map((option) => option.heightMm)).toEqual([120, 300, 400]);
    expect(result.options.some((option) => option.allowed)).toBe(true);
  });

  it('ListNextOptions blocks candidate that would align with adjacent column level', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'DESIGN_IN_PROGRESS',
        category: 'TONDO',
        columnPlan: {
          columnCount: 2,
          columns: [
            { index: 0, shelfWidthMm: 800 },
            { index: 1, shelfWidthMm: 600 },
          ],
        },
        columnDesigns: [{ columnIndex: 1, levelsMm: [120], shelfThicknessMm: 20 }],
      }),
    );

    const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnIndex: 0,
    });

    const conflicting = result.options.find((option) => option.heightMm === 120);
    expect(conflicting).toBeDefined();
    expect(conflicting?.allowed).toBe(false);
    expect(conflicting?.reasonCode).toBe('ADJACENCY_CONFLICT');
  });

  it('ResetConfiguration clears columns/design but keeps the selected category', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'READY_FOR_FINALIZE',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
        columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
        terminalSelections: [{ spineIndex: 0, heightMm: 40 }],
        components: [
          { sku: 'RIP-800', name: 'Ripiano 800', quantity: 2, unitPriceCents: 3490, componentType: 'RIPIANO' },
        ],
      }),
    );

    const useCase = new ResetConfiguration(repo);
    const result = await useCase.execute({ id: 'cfg_test', ownerId: 'usr_1' });

    expect(result.category).toBe('TONDO');
    expect(result.status).toBe('CATEGORY_SELECTED');
    expect(result.columnPlan).toBeNull();
    expect(result.columnDesigns).toEqual([]);
    expect(result.terminalSelections).toEqual([]);
    expect(result.bom).toEqual([]);
    expect(result.version).toBe(2);
  });

  it('ResetConfiguration rejects a finalized configuration', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ status: 'FINALIZED', category: 'TONDO' }));

    const useCase = new ResetConfiguration(repo);
    await expect(
      useCase.execute({ id: 'cfg_test', ownerId: 'usr_1' }),
    ).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
  });

  it('SetColumnPlan changing columns after a design exists resets design and terminal selections', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'DESIGN_IN_PROGRESS',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
        columnDesigns: [{ columnIndex: 0, levelsMm: [120], shelfThicknessMm: 20 }],
        terminalSelections: [{ spineIndex: 0, heightMm: 40 }],
      }),
    );

    const useCase = new SetColumnPlan(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnPlan: {
        columnCount: 2,
        columns: [
          { index: 0, shelfWidthMm: 800 },
          { index: 1, shelfWidthMm: 600 },
        ],
      },
    });

    expect(result.status).toBe('COLUMNS_DEFINED');
    expect(result.columnPlan?.columns).toHaveLength(2);
    expect(result.columnDesigns).toEqual([]);
    expect(result.terminalSelections).toEqual([]);
  });

  it('UpdateDesign rejects a terminal selection height not available in the catalog', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());

    await expect(
      useCase.execute({
        id: 'cfg_test',
        ownerId: 'usr_1',
        columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
        terminalSelections: [{ spineIndex: 0, heightMm: 999 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('UpdateDesign rejects a terminal selection spineIndex outside the spine range', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());

    // 1 column => spines 0..1; spineIndex 2 does not exist.
    await expect(
      useCase.execute({
        id: 'cfg_test',
        ownerId: 'usr_1',
        columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
        terminalSelections: [{ spineIndex: 2, heightMm: 40 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('UpdateDesign persists a valid terminal selection and deriveBom uses its exact SKU', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const catalog = new FakeCatalogRulesProvider(buildCatalogRules({
      terminalHeightsMm: [40, 80],
      terminalByHeightMm: new Map([
        [40, { type: 'TERMINALE', sku: 'TER-40', name: 'Terminale 40', priceCents: 390, widthMm: 40, heightMm: 40, depthMm: 40 }],
        [80, { type: 'TERMINALE', sku: 'TER-80', name: 'Terminale 80', priceCents: 590, widthMm: 40, heightMm: 80, depthMm: 40 }],
      ]),
    }));

    const useCase = new UpdateDesign(repo, catalog);
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
      terminalSelections: [{ spineIndex: 0, heightMm: 80 }, { spineIndex: 1, heightMm: 80 }],
    });

    expect(result.terminalSelections).toEqual([{ spineIndex: 0, heightMm: 80 }, { spineIndex: 1, heightMm: 80 }]);
    const terminalItems = result.bom!.filter((item) => item.componentType === 'TERMINALE');
    expect(terminalItems).toHaveLength(1);
    expect(terminalItems[0].sku).toBe('TER-80');
  });

  it('UpdateDesign omitting terminalSelections keeps the previously persisted selections', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'DESIGN_IN_PROGRESS',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
        columnDesigns: [{ columnIndex: 0, levelsMm: [120], shelfThicknessMm: 20 }],
        terminalSelections: [{ spineIndex: 0, heightMm: 40 }, { spineIndex: 1, heightMm: 40 }],
      }),
    );

    const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
    });

    expect(result.terminalSelections).toEqual([{ spineIndex: 0, heightMm: 40 }, { spineIndex: 1, heightMm: 40 }]);
  });

  it('ListNextOptions returns empty options for column index outside current plan', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'COLUMNS_DEFINED',
        category: 'TONDO',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 800 }],
        },
      }),
    );

    const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnIndex: 1,
    });

    expect(result.columnIndex).toBe(1);
    expect(result.options).toEqual([]);
    expect(result.lookAhead.feasible).toBe(false);
  });

  it('SetDepth stores the selected depth once a category is set', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ status: 'CATEGORY_SELECTED', category: 'TONDO' }));

    const useCase = new SetDepth(repo, new FakeCatalogRulesProvider());
    const result = await useCase.execute({ id: 'cfg_test', ownerId: 'usr_1', depthMm: 300 });

    expect(result.depthMm).toBe(300);
    expect(result.status).toBe('CATEGORY_SELECTED');
  });

  it('SetDepth rejects a depth not available in the catalog for the category', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ status: 'CATEGORY_SELECTED', category: 'TONDO' }));

    const useCase = new SetDepth(repo, new FakeCatalogRulesProvider());

    await expect(
      useCase.execute({ id: 'cfg_test', ownerId: 'usr_1', depthMm: 999 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('SetDepth rejects when no category has been selected yet', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ status: 'DRAFT', category: null }));

    const useCase = new SetDepth(repo, new FakeCatalogRulesProvider());

    await expect(
      useCase.execute({ id: 'cfg_test', ownerId: 'usr_1', depthMm: 300 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
  });

  it('SetDepth changing depth after a column plan exists resets plan/design back to CATEGORY_SELECTED', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        status: 'DESIGN_IN_PROGRESS',
        category: 'TONDO',
        depthMm: 300,
        columnPlan: { columnCount: 1, columns: [{ index: 0, shelfWidthMm: 800 }] },
        columnDesigns: [{ columnIndex: 0, levelsMm: [120], shelfThicknessMm: 20 }],
      }),
    );

    const catalog = new FakeCatalogRulesProvider(buildCatalogRules({
      shelfByWidthMm: new Map([
        [600, { type: 'RIPIANO', sku: 'RIP-600-D200', name: 'Ripiano 600', priceCents: 2990, widthMm: 600, heightMm: 20, depthMm: 200 }],
      ]),
    }));

    const useCase = new SetDepth(repo, catalog);
    const result = await useCase.execute({ id: 'cfg_test', ownerId: 'usr_1', depthMm: 200 });

    expect(result.depthMm).toBe(200);
    expect(result.status).toBe('CATEGORY_SELECTED');
    expect(result.columnPlan).toBeNull();
    expect(result.columnDesigns).toEqual([]);
  });

  it('SetColumnPlan forwards the configuration depth to the catalog rules provider', async () => {
    const repo = new FakeConfigurationRepository();
    repo.seed(buildConfiguration({ status: 'CATEGORY_SELECTED', category: 'TONDO', depthMm: 200 }));

    const calls: Array<[string | undefined, number | undefined]> = [];
    const spyingCatalog = new FakeCatalogRulesProvider();
    const originalGetRules = spyingCatalog.getRules.bind(spyingCatalog);
    spyingCatalog.getRules = async (category, depthMm) => {
      calls.push([category, depthMm]);
      return originalGetRules(category, depthMm);
    };

    const useCase = new SetColumnPlan(repo, spyingCatalog);
    await useCase.execute({
      id: 'cfg_test',
      ownerId: 'usr_1',
      columnPlan: { columnCount: 1, columns: [{ index: 0, shelfWidthMm: 800 }] },
    });

    expect(calls).toEqual([['TONDO', 200]]);
  });
});