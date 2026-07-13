import { deriveBom } from '../../src/domain/services/deriveBom';
import { UpdateDesign } from '../../src/useCases/write/UpdateDesign';
import { ListNextOptions } from '../../src/useCases/read/ListNextOptions';
import {
  FakeCatalogRulesProvider,
  FakeConfigurationRepository,
  buildCatalogRules,
  buildConfiguration,
} from '../helpers/fakes';
import { CatalogRules } from '../../src/domain/ports/CatalogRulesProvider';

/**
 * Unit tests for the INTELLIGENTE construction logic.
 *
 * INTELLIGENTE rules:
 * - Outer columns (first and last): RIPIANO_BORDO shelf type.
 * - Inner columns: RIPIANO_INTERMEDIO shelf type.
 * - All columns must have identical levelsMm (cross-column alignment).
 * - PIEDINO / MONTANTE / TERMINALE: same shared-spine model as STANDARD.
 */
describe('INTELLIGENTE construction logic', () => {
  const ENV = {
    maxWidthMm: 5000,
    maxHeightMm: 3000,
    minWidthMm: 600,
    minHeightMm: 220,
    unit: 'mm' as const,
  };

  /** Builds catalog rules with INTELLIGENTE bordo/intermezzo maps populated. */
  function buildIntelligenteCatalogRules(overrides: Partial<CatalogRules> = {}): CatalogRules {
    const bordoMap = new Map([
      [600, { type: 'RIPIANO_BORDO' as const, sku: 'BORDO-600', name: 'Bordo 600', priceCents: 800, widthMm: 600, heightMm: 18, depthMm: 200 }],
      [800, { type: 'RIPIANO_BORDO' as const, sku: 'BORDO-800', name: 'Bordo 800', priceCents: 1000, widthMm: 800, heightMm: 18, depthMm: 200 }],
    ]);
    const intermezzoMap = new Map([
      [600, { type: 'RIPIANO_INTERMEDIO' as const, sku: 'INT-600', name: 'Intermezzo 600', priceCents: 700, widthMm: 600, heightMm: 18, depthMm: 200 }],
      [800, { type: 'RIPIANO_INTERMEDIO' as const, sku: 'INT-800', name: 'Intermezzo 800', priceCents: 900, widthMm: 800, heightMm: 18, depthMm: 200 }],
    ]);
    return buildCatalogRules({
      bordoByWidthMm: bordoMap,
      intermezzoByWidthMm: intermezzoMap,
      ...overrides,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // deriveBom tests
  // ──────────────────────────────────────────────────────────────────────────

  describe('deriveBom', () => {
    it('2 columns — both outer → both BORDO', () => {
      const cfg = buildConfiguration({
        category: 'INTELLIGENTE',
        status: 'READY_FOR_FINALIZE',
        environment: ENV,
        columnPlan: {
          columnCount: 2,
          columns: [
            { index: 0, shelfWidthMm: 600 },
            { index: 1, shelfWidthMm: 600 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120, 440] },
        ],
      });

      const rules = buildIntelligenteCatalogRules();
      const bom = deriveBom(cfg, rules);

      const shelfItems = bom.filter((item) => item.componentType === 'RIPIANO_BORDO');
      expect(shelfItems).toHaveLength(1); // same SKU → aggregated
      expect(shelfItems[0].sku).toBe('BORDO-600');
      expect(shelfItems[0].quantity).toBe(4); // 2 levels × 2 columns

      const intermezzoItems = bom.filter((item) => item.componentType === 'RIPIANO_INTERMEDIO');
      expect(intermezzoItems).toHaveLength(0);
    });

    it('3 columns — outer=BORDO, inner=INTERMEZZO', () => {
      const cfg = buildConfiguration({
        category: 'INTELLIGENTE',
        status: 'READY_FOR_FINALIZE',
        environment: ENV,
        columnPlan: {
          columnCount: 3,
          columns: [
            { index: 0, shelfWidthMm: 600 },
            { index: 1, shelfWidthMm: 600 },
            { index: 2, shelfWidthMm: 600 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [120, 440] },
        ],
      });

      const rules = buildIntelligenteCatalogRules();
      const bom = deriveBom(cfg, rules);

      const bordoItems = bom.filter((item) => item.componentType === 'RIPIANO_BORDO');
      expect(bordoItems).toHaveLength(1);
      expect(bordoItems[0].quantity).toBe(4); // 2 levels × 2 outer columns

      const intermezzoItems = bom.filter((item) => item.componentType === 'RIPIANO_INTERMEDIO');
      expect(intermezzoItems).toHaveLength(1);
      expect(intermezzoItems[0].quantity).toBe(2); // 2 levels × 1 inner column
    });

    it('4 columns — 2 outer=BORDO, 2 inner=INTERMEZZO', () => {
      const cfg = buildConfiguration({
        category: 'INTELLIGENTE',
        status: 'READY_FOR_FINALIZE',
        environment: ENV,
        columnPlan: {
          columnCount: 4,
          columns: [
            { index: 0, shelfWidthMm: 600 },
            { index: 1, shelfWidthMm: 600 },
            { index: 2, shelfWidthMm: 600 },
            { index: 3, shelfWidthMm: 600 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 3, shelfThicknessMm: 20, levelsMm: [120, 440] },
        ],
      });

      const rules = buildIntelligenteCatalogRules();
      const bom = deriveBom(cfg, rules);

      const bordoItems = bom.filter((item) => item.componentType === 'RIPIANO_BORDO');
      expect(bordoItems[0].quantity).toBe(4); // 2 levels × 2 outer columns

      const intermezzoItems = bom.filter((item) => item.componentType === 'RIPIANO_INTERMEDIO');
      expect(intermezzoItems[0].quantity).toBe(4); // 2 levels × 2 inner columns
    });

    it('throws if BORDO shelf is missing for outer column', () => {
      const cfg = buildConfiguration({
        category: 'INTELLIGENTE',
        status: 'READY_FOR_FINALIZE',
        environment: ENV,
        columnPlan: {
          columnCount: 2,
          columns: [
            { index: 0, shelfWidthMm: 9999 }, // no rule for this width
            { index: 1, shelfWidthMm: 9999 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },
        ],
      });

      const rules = buildIntelligenteCatalogRules();
      expect(() => deriveBom(cfg, rules)).toThrow('BORDO');
    });

    it('throws if INTERMEZZO shelf is missing for inner column', () => {
      const cfg = buildConfiguration({
        category: 'INTELLIGENTE',
        status: 'READY_FOR_FINALIZE',
        environment: ENV,
        columnPlan: {
          columnCount: 3,
          columns: [
            { index: 0, shelfWidthMm: 600 },
            { index: 1, shelfWidthMm: 9999 }, // no INTERMEZZO for this width
            { index: 2, shelfWidthMm: 600 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [120] },
        ],
      });

      const rules = buildIntelligenteCatalogRules();
      expect(() => deriveBom(cfg, rules)).toThrow('INTERMEZZO');
    });

    it('STANDARD category still uses shelfByWidthMm (no regression)', () => {
      const cfg = buildConfiguration({
        category: 'TONDO',
        status: 'READY_FOR_FINALIZE',
        environment: ENV,
        columnPlan: {
          columnCount: 2,
          columns: [
            { index: 0, shelfWidthMm: 600 },
            { index: 1, shelfWidthMm: 600 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120, 440] },
        ],
      });

      const rules = buildCatalogRules(); // standard rules with shelfByWidthMm 600
      const bom = deriveBom(cfg, rules);

      const ripiani = bom.filter((item) => item.componentType === 'RIPIANO');
      expect(ripiani[0].quantity).toBe(4); // 2 levels × 2 columns
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // UpdateDesign alignment tests
  // ──────────────────────────────────────────────────────────────────────────

  describe('UpdateDesign — INTELLIGENTE alignment', () => {
    function makeRepo() {
      const repo = new FakeConfigurationRepository();
      repo.seed(
        buildConfiguration({
          id: 'cfg_int',
          ownerId: 'usr_1',
          category: 'INTELLIGENTE',
          status: 'COLUMNS_DEFINED',
          environment: ENV,
          columnPlan: {
            columnCount: 3,
            columns: [
              { index: 0, shelfWidthMm: 600 },
              { index: 1, shelfWidthMm: 600 },
              { index: 2, shelfWidthMm: 600 },
            ],
          },
          columnDesigns: [],
        }),
      );
      return repo;
    }

    it('accepts aligned levels across all columns', async () => {
      const repo = makeRepo();
      const rules = buildIntelligenteCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({
        id: 'cfg_int',
        ownerId: 'usr_1',
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [120, 440] },
        ],
      });

      expect(result.status).not.toBe('DRAFT');
    });

    it('rejects when columns have different level counts', async () => {
      const repo = makeRepo();
      const rules = buildIntelligenteCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      await expect(
        useCase.execute({
          id: 'cfg_int',
          ownerId: 'usr_1',
          columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] }, // 2 levels
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },       // 1 level
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [120, 440] }, // 2 levels
          ],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects when columns have same count but different heights', async () => {
      const repo = makeRepo();
      const rules = buildIntelligenteCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      await expect(
        useCase.execute({
          id: 'cfg_int',
          ownerId: 'usr_1',
          columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120, 640] }, // different second level
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [120, 440] },
          ],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects when BORDO shelf width is not in catalog', async () => {
      const repo = new FakeConfigurationRepository();
      repo.seed(
        buildConfiguration({
          id: 'cfg_int',
          ownerId: 'usr_1',
          category: 'INTELLIGENTE',
          status: 'COLUMNS_DEFINED',
          environment: ENV,
          columnPlan: {
            columnCount: 2,
            columns: [
              { index: 0, shelfWidthMm: 9999 }, // no BORDO for this width
              { index: 1, shelfWidthMm: 9999 },
            ],
          },
          columnDesigns: [],
        }),
      );

      const rules = buildIntelligenteCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      await expect(
        useCase.execute({
          id: 'cfg_int',
          ownerId: 'usr_1',
          columnDesigns: [
            { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [80] },
            { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [80] },
          ],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ListNextOptions — INTELLIGENTE shelf map selection
  // ──────────────────────────────────────────────────────────────────────────

  describe('ListNextOptions — INTELLIGENTE', () => {
    function makeIntelligenteCfg(columns: { index: number; shelfWidthMm: number }[]) {
      const repo = new FakeConfigurationRepository();
      repo.seed(
        buildConfiguration({
          id: 'cfg_int',
          ownerId: 'usr_1',
          category: 'INTELLIGENTE',
          status: 'COLUMNS_DEFINED',
          environment: ENV,
          columnPlan: { columnCount: columns.length, columns },
          columnDesigns: [],
        }),
      );
      return repo;
    }

    it('outer column — uses bordoByWidthMm, no error when shelf exists', async () => {
      const repo = makeIntelligenteCfg([
        { index: 0, shelfWidthMm: 600 },
        { index: 1, shelfWidthMm: 600 },
        { index: 2, shelfWidthMm: 600 },
      ]);
      const rules = buildIntelligenteCatalogRules();
      const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({ id: 'cfg_int', ownerId: 'usr_1', columnIndex: 0 });
      expect(result.columnIndex).toBe(0);
      expect(result.options.length).toBeGreaterThan(0);
    });

    it('inner column — uses intermezzoByWidthMm, no error when shelf exists', async () => {
      const repo = makeIntelligenteCfg([
        { index: 0, shelfWidthMm: 600 },
        { index: 1, shelfWidthMm: 600 },
        { index: 2, shelfWidthMm: 600 },
      ]);
      const rules = buildIntelligenteCatalogRules();
      const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({ id: 'cfg_int', ownerId: 'usr_1', columnIndex: 1 });
      expect(result.columnIndex).toBe(1);
    });

    it('outer column with unknown width → throws VALIDATION_ERROR', async () => {
      const repo = makeIntelligenteCfg([
        { index: 0, shelfWidthMm: 9999 },
        { index: 1, shelfWidthMm: 9999 },
      ]);
      const rules = buildIntelligenteCatalogRules();
      const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider(rules));

      await expect(
        useCase.execute({ id: 'cfg_int', ownerId: 'usr_1', columnIndex: 0 }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('inner column with unknown width → throws VALIDATION_ERROR', async () => {
      const repo = makeIntelligenteCfg([
        { index: 0, shelfWidthMm: 600 },
        { index: 1, shelfWidthMm: 9999 }, // inner, no INTERMEZZO rule
        { index: 2, shelfWidthMm: 600 },
      ]);
      const rules = buildIntelligenteCatalogRules();
      const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider(rules));

      await expect(
        useCase.execute({ id: 'cfg_int', ownerId: 'usr_1', columnIndex: 1 }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });
});
