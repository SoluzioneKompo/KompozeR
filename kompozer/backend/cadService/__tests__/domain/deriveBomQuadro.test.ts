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
 * Unit tests for the QUADRO construction logic: a mix of the STANDARD shared-spine
 * model (feet/uprights/terminals, no cross-column level-count alignment) and the
 * former INTELLIGENTE shelf logic, now scoped *per level* instead of per column:
 *
 * - A level not shared with any index-adjacent column uses a plain RIPIANO shelf.
 * - A level shared by exactly 2 adjacent columns uses RIPIANO_BORDO on both.
 * - A level shared by N>=3 adjacent columns uses RIPIANO_BORDO on the two ends and
 *   RIPIANO_INTERMEDIO in between.
 * - The same column can have some levels NORMALE and others BORDO/INTERMEDIO.
 * - PIEDINO / MONTANTE / TERMINALE: same shared-spine model as STANDARD/TONDO.
 */
describe('QUADRO construction logic', () => {
  /** Builds catalog rules with QUADRO bordo/intermezzo maps populated (widths 600, 800). */
  function buildQuadroCatalogRules(overrides: Partial<CatalogRules> = {}): CatalogRules {
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
    it('mix: a level shared by 2 adjacent columns → BORDO, an independent level on the same column → RIPIANO', () => {
      // Column 0 and 1 share level 120 (adjacent, cluster of 2) -> BORDO/BORDO.
      // Column 1's level 440 is not shared by any neighbor (column 2 is empty) -> RIPIANO.
      const cfg = buildConfiguration({
        category: 'QUADRO',
        status: 'READY_FOR_FINALIZE',
        columnPlan: {
          columnCount: 3,
          columns: [
            { index: 0, shelfWidthMm: 600 },
            { index: 1, shelfWidthMm: 600 },
            { index: 2, shelfWidthMm: 600 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [] },
        ],
      });

      const rules = buildQuadroCatalogRules();
      const bom = deriveBom(cfg, rules);

      const bordoItems = bom.filter((item) => item.componentType === 'RIPIANO_BORDO');
      expect(bordoItems).toHaveLength(1);
      expect(bordoItems[0].sku).toBe('BORDO-600');
      expect(bordoItems[0].quantity).toBe(2); // column 0 @120 + column 1 @120

      const ripianoItems = bom.filter((item) => item.componentType === 'RIPIANO');
      expect(ripianoItems).toHaveLength(1);
      expect(ripianoItems[0].sku).toBe('RIP-600');
      expect(ripianoItems[0].quantity).toBe(1); // column 1 @440, not shared

      expect(bom.filter((item) => item.componentType === 'RIPIANO_INTERMEDIO')).toHaveLength(0);
    });

    it('3 adjacent columns sharing every level → BORDO, INTERMEDIO, BORDO', () => {
      const cfg = buildConfiguration({
        category: 'QUADRO',
        status: 'READY_FOR_FINALIZE',
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

      const rules = buildQuadroCatalogRules();
      const bom = deriveBom(cfg, rules);

      const bordoItems = bom.filter((item) => item.componentType === 'RIPIANO_BORDO');
      expect(bordoItems).toHaveLength(1);
      expect(bordoItems[0].quantity).toBe(4); // 2 levels x 2 outer columns

      const intermezzoItems = bom.filter((item) => item.componentType === 'RIPIANO_INTERMEDIO');
      expect(intermezzoItems).toHaveLength(1);
      expect(intermezzoItems[0].quantity).toBe(2); // 2 levels x 1 inner column
    });

    it('columns not all sharing the same level form independent 2-clusters, not one 3-cluster', () => {
      // Column 1 shares level 120 with column 0 (cluster A), and shares a
      // *different* level 440 with column 2 (cluster B). Two separate BORDO
      // pairs, never an INTERMEDIO, because the two clusters use different levels.
      const cfg = buildConfiguration({
        category: 'QUADRO',
        status: 'READY_FOR_FINALIZE',
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
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120, 440] },
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [440] },
          { columnIndex: 3, shelfThicknessMm: 20, levelsMm: [120] },
        ],
      });

      const rules = buildQuadroCatalogRules();
      const bom = deriveBom(cfg, rules);

      const bordoItems = bom.filter((item) => item.componentType === 'RIPIANO_BORDO');
      expect(bordoItems).toHaveLength(1);
      // column0@120 + column1@120 + column1@440 + column2@440
      expect(bordoItems[0].quantity).toBe(4);

      expect(bom.filter((item) => item.componentType === 'RIPIANO_INTERMEDIO')).toHaveLength(0);

      const ripianoItems = bom.filter((item) => item.componentType === 'RIPIANO');
      expect(ripianoItems).toHaveLength(1);
      expect(ripianoItems[0].quantity).toBe(1); // column3@120, isolated (column2 has no level 120)
    });

    it('throws if BORDO shelf is missing for a shared level between 2 columns', () => {
      const cfg = buildConfiguration({
        category: 'QUADRO',
        status: 'READY_FOR_FINALIZE',
        columnPlan: {
          columnCount: 2,
          columns: [
            { index: 0, shelfWidthMm: 9999 }, // no BORDO rule for this width
            { index: 1, shelfWidthMm: 9999 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },
        ],
      });

      const rules = buildQuadroCatalogRules();
      expect(() => deriveBom(cfg, rules)).toThrow('BORDO');
    });

    it('throws if INTERMEDIO shelf is missing for the middle column of a 3-cluster', () => {
      const cfg = buildConfiguration({
        category: 'QUADRO',
        status: 'READY_FOR_FINALIZE',
        columnPlan: {
          columnCount: 3,
          columns: [
            { index: 0, shelfWidthMm: 700 },
            { index: 1, shelfWidthMm: 700 },
            { index: 2, shelfWidthMm: 700 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [120] },
        ],
      });

      const rules = buildQuadroCatalogRules({
        bordoByWidthMm: new Map([
          [700, { type: 'RIPIANO_BORDO' as const, sku: 'BORDO-700', name: 'Bordo 700', priceCents: 900, widthMm: 700, heightMm: 18, depthMm: 200 }],
        ]),
        intermezzoByWidthMm: new Map(), // no INTERMEDIO rule for width 700
      });
      expect(() => deriveBom(cfg, rules)).toThrow('INTERMEDIO');
    });

    it('STANDARD category (TONDO) still uses shelfByWidthMm per column (no regression)', () => {
      const cfg = buildConfiguration({
        category: 'TONDO',
        status: 'READY_FOR_FINALIZE',
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

    it('QUADRO without any adjacency behaves like STANDARD: every level uses plain RIPIANO', () => {
      const cfg = buildConfiguration({
        category: 'QUADRO',
        status: 'READY_FOR_FINALIZE',
        columnPlan: {
          columnCount: 1,
          columns: [{ index: 0, shelfWidthMm: 600 }],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] },
        ],
      });

      const rules = buildQuadroCatalogRules();
      const bom = deriveBom(cfg, rules);

      const ripiani = bom.filter((item) => item.componentType === 'RIPIANO');
      expect(ripiani[0].quantity).toBe(2);
      expect(bom.filter((item) => item.componentType === 'RIPIANO_BORDO')).toHaveLength(0);
      expect(bom.filter((item) => item.componentType === 'RIPIANO_INTERMEDIO')).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // UpdateDesign — QUADRO adjacency tests
  // ──────────────────────────────────────────────────────────────────────────

  describe('UpdateDesign — QUADRO adjacency', () => {
    function makeRepo() {
      const repo = new FakeConfigurationRepository();
      repo.seed(
        buildConfiguration({
          id: 'cfg_quadro',
          ownerId: 'usr_1',
          category: 'QUADRO',
          status: 'COLUMNS_DEFINED',
          columnPlan: {
            columnCount: 2,
            columns: [
              { index: 0, shelfWidthMm: 600 },
              { index: 1, shelfWidthMm: 600 },
            ],
          },
          columnDesigns: [],
        }),
      );
      return repo;
    }

    it('accepts two adjacent columns sharing a level (no ADJACENCY_CONFLICT for QUADRO)', async () => {
      const repo = makeRepo();
      const rules = buildQuadroCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({
        id: 'cfg_quadro',
        ownerId: 'usr_1',
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },
        ],
      });

      expect(result.status).not.toBe('DRAFT');
    });

    it('dynamically converts a plain shelf into BORDO once a neighbor gets the same level', async () => {
      const repo = makeRepo();
      const rules = buildQuadroCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      // Step 1: column 0 alone gets level 120, column 1 stays empty -> plain RIPIANO.
      const first = await useCase.execute({
        id: 'cfg_quadro',
        ownerId: 'usr_1',
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
        ],
      });
      expect((first.bom ?? []).some((item) => item.componentType === 'RIPIANO' && item.sku === 'RIP-600')).toBe(true);
      expect((first.bom ?? []).some((item) => item.componentType === 'RIPIANO_BORDO')).toBe(false);

      // Step 2: column 1 now also gets level 120 -> the whole snapshot is
      // recomputed and column 0's shelf turns into BORDO (no incremental state).
      const second = await useCase.execute({
        id: 'cfg_quadro',
        ownerId: 'usr_1',
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },
        ],
      });
      expect((second.bom ?? []).some((item) => item.componentType === 'RIPIANO')).toBe(false);
      const bordo = (second.bom ?? []).find((item) => item.componentType === 'RIPIANO_BORDO');
      expect(bordo?.sku).toBe('BORDO-600');
      expect(bordo?.quantity).toBe(2);
    });

    it('rejects a shared level when the catalog has no BORDO/INTERMEDIO shelf for that width', async () => {
      const repo = new FakeConfigurationRepository();
      repo.seed(
        buildConfiguration({
          id: 'cfg_quadro',
          ownerId: 'usr_1',
          category: 'QUADRO',
          status: 'COLUMNS_DEFINED',
          columnPlan: {
            columnCount: 2,
            columns: [
              { index: 0, shelfWidthMm: 9999 },
              { index: 1, shelfWidthMm: 9999 },
            ],
          },
          columnDesigns: [],
        }),
      );

      // A plain RIPIANO exists for width 9999 (so the Step2-equivalent baseline
      // check passes), but no BORDO/INTERMEDIO rule — the adjacency itself must
      // be the thing that fails.
      const rules = buildQuadroCatalogRules({
        shelfByWidthMm: new Map([
          [9999, { type: 'RIPIANO' as const, sku: 'RIP-9999', name: 'Ripiano 9999', priceCents: 5000, widthMm: 9999, heightMm: 20, depthMm: 300 }],
        ]),
      });
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      await expect(
        useCase.execute({
          id: 'cfg_quadro',
          ownerId: 'usr_1',
          columnDesigns: [
            { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
            { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },
          ],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringContaining('BORDO') });
    });

    it('does not enforce cross-column level-count alignment (no more global INTELLIGENTE constraint)', async () => {
      const repo = makeRepo();
      const rules = buildQuadroCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({
        id: 'cfg_quadro',
        ownerId: 'usr_1',
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 440] }, // 2 levels
          { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [] },         // 0 levels
        ],
      });

      expect(result.status).not.toBe('DRAFT');
    });

    it('still rejects a geometrically invalid segment even with the relaxed adjacency rule', async () => {
      const repo = makeRepo();
      const rules = buildQuadroCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      await expect(
        useCase.execute({
          id: 'cfg_quadro',
          ownerId: 'usr_1',
          columnDesigns: [
            { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120, 200] }, // segment 60mm, not a valid upright
            { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [] },
          ],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('TONDO still rejects two adjacent columns sharing a level (no regression)', async () => {
      const repo = new FakeConfigurationRepository();
      repo.seed(
        buildConfiguration({
          id: 'cfg_tondo',
          ownerId: 'usr_1',
          category: 'TONDO',
          status: 'COLUMNS_DEFINED',
          columnPlan: {
            columnCount: 2,
            columns: [
              { index: 0, shelfWidthMm: 600 },
              { index: 1, shelfWidthMm: 600 },
            ],
          },
          columnDesigns: [],
        }),
      );

      const rules = buildCatalogRules();
      const useCase = new UpdateDesign(repo, new FakeCatalogRulesProvider(rules));

      await expect(
        useCase.execute({
          id: 'cfg_tondo',
          ownerId: 'usr_1',
          columnDesigns: [
            { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [120] },
            { columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] },
          ],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ListNextOptions — QUADRO adjacency
  // ──────────────────────────────────────────────────────────────────────────

  describe('ListNextOptions — QUADRO adjacency', () => {
    function makeRepo(columns: { index: number; shelfWidthMm: number }[], columnDesigns: { columnIndex: number; shelfThicknessMm: number; levelsMm: number[] }[], category: 'QUADRO' | 'TONDO' = 'QUADRO') {
      const repo = new FakeConfigurationRepository();
      repo.seed(
        buildConfiguration({
          id: 'cfg_next',
          ownerId: 'usr_1',
          category,
          status: 'COLUMNS_DEFINED',
          columnPlan: { columnCount: columns.length, columns },
          columnDesigns,
        }),
      );
      return repo;
    }

    it('allows a candidate that lands on a neighbor level when the catalog covers the resulting cluster', async () => {
      const repo = makeRepo(
        [
          { index: 0, shelfWidthMm: 600 },
          { index: 1, shelfWidthMm: 600 },
        ],
        [{ columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] }],
      );
      const rules = buildQuadroCatalogRules();
      const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({ id: 'cfg_next', ownerId: 'usr_1', columnIndex: 0 });
      const option = result.options.find((o) => o.heightMm === 120);
      expect(option?.allowed).toBe(true);
      expect(option?.reasonCode).toBeUndefined();
    });

    it('blocks a candidate that would land on a neighbor level when the catalog has no BORDO for that width', async () => {
      const repo = makeRepo(
        [
          { index: 0, shelfWidthMm: 9999 },
          { index: 1, shelfWidthMm: 9999 },
        ],
        [{ columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] }],
      );
      // A plain RIPIANO exists for width 9999 (Step2 only requires that), but
      // no BORDO/INTERMEDIO rule — so the shared level must be rejected.
      const rules = buildQuadroCatalogRules({
        shelfByWidthMm: new Map([
          [9999, { type: 'RIPIANO' as const, sku: 'RIP-9999', name: 'Ripiano 9999', priceCents: 5000, widthMm: 9999, heightMm: 20, depthMm: 300 }],
        ]),
      });
      const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({ id: 'cfg_next', ownerId: 'usr_1', columnIndex: 0 });
      const option = result.options.find((o) => o.heightMm === 120);
      expect(option?.allowed).toBe(false);
      expect(option?.reasonCode).toBe('INTELLIGENTE_CATALOG_MISSING');
    });

    it('candidates that do not collide with any neighbor behave like STANDARD', async () => {
      const repo = makeRepo(
        [
          { index: 0, shelfWidthMm: 600 },
          { index: 1, shelfWidthMm: 600 },
          { index: 2, shelfWidthMm: 600 },
        ],
        [],
      );
      const rules = buildQuadroCatalogRules();
      const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({ id: 'cfg_next', ownerId: 'usr_1', columnIndex: 1 });
      expect(result.options.length).toBeGreaterThan(0);
      expect(result.options.some((o) => o.allowed)).toBe(true);
    });

    it('TONDO still blocks a candidate colliding with a neighbor level (no regression)', async () => {
      const repo = makeRepo(
        [
          { index: 0, shelfWidthMm: 600 },
          { index: 1, shelfWidthMm: 600 },
        ],
        [{ columnIndex: 1, shelfThicknessMm: 20, levelsMm: [120] }],
        'TONDO',
      );
      const rules = buildCatalogRules();
      const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider(rules));

      const result = await useCase.execute({ id: 'cfg_next', ownerId: 'usr_1', columnIndex: 0 });
      const option = result.options.find((o) => o.heightMm === 120);
      expect(option?.allowed).toBe(false);
      expect(option?.reasonCode).toBe('ADJACENCY_CONFLICT');
    });
  });
});
