import { deriveBom } from '../../src/domain/services/deriveBom';
import { BomItem } from '../../src/domain/entities/Bom';
import { buildCatalogRules, buildConfiguration } from '../helpers/fakes';

function sumByType(bom: BomItem[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of bom) {
    result[item.componentType] = (result[item.componentType] ?? 0) + item.quantity;
  }
  return result;
}

/** Unit tests for BOM derivation from validated CAD configurations. */
describe('deriveBom', () => {
  it('single column: counts shelves and shared-spine components correctly', () => {
    const cfg = buildConfiguration({
      status: 'DESIGN_IN_PROGRESS',
      category: 'TONDO',
      columnPlan: { columnCount: 1, columns: [{ index: 0, shelfWidthMm: 800 }] },
      // Two exterior spines share the same column levels.
      columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
    });

    const bom = deriveBom(cfg, buildCatalogRules());

    const byType = sumByType(bom);

    // 2 shelves
    expect(byType['RIPIANO']).toBe(2);
    // 2 spines × 2 feet = 4
    expect(byType['PIEDINO']).toBe(4);
    // 2 spines × 2 terminals = 4
    expect(byType['TERMINALE']).toBe(4);
    // 2 spines × 1 upright segment × 2 = 4
    expect(byType['MONTANTE']).toBe(4);
  });

  it('two adjacent columns: interior spine is counted once', () => {
    const cfg = buildConfiguration({
      status: 'DESIGN_IN_PROGRESS',
      category: 'TONDO',
      columnPlan: {
        columnCount: 2,
        columns: [
          { index: 0, shelfWidthMm: 800 },
          { index: 1, shelfWidthMm: 600 },
        ],
      },
      // Valid shared-spine snapshot: both columns use the same levels, so the
      // interior spine is the distinct merge [120, 440].
      columnDesigns: [
        { columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 },
        { columnIndex: 1, levelsMm: [120, 440], shelfThicknessMm: 20 },
      ],
    });

    const bom = deriveBom(cfg, buildCatalogRules());

    const byType = sumByType(bom);

    // 2 shelves × 2 columns = 4 RIPIANO (different SKUs aggregated by SKU)
    const totalShelves = bom.filter((b) => b.componentType === 'RIPIANO').reduce((s, b) => s + b.quantity, 0);
    expect(totalShelves).toBe(4);

    // 3 spines (left, interior, right) × 1 upright segment × 2 = 6
    expect(byType['MONTANTE']).toBe(6);

    // 3 spines × 2 components each
    expect(byType['PIEDINO']).toBe(6);
    expect(byType['TERMINALE']).toBe(6);
  });

  it('KUBE: is currently treated like every other system', () => {
    const cfg = buildConfiguration({
      status: 'DESIGN_IN_PROGRESS',
      category: 'KUBE',
      columnPlan: { columnCount: 1, columns: [{ index: 0, shelfWidthMm: 800 }] },
      columnDesigns: [{ columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 }],
    });

    const bom = deriveBom(cfg, buildCatalogRules());

    const byType = sumByType(bom);

    expect(byType['MONTANTE']).toBe(4);
    expect(byType['PIEDINO']).toBe(4);
    expect(byType['TERMINALE']).toBe(4);
  });

  it('aggregates items with same SKU across columns', () => {
    // Both columns have the same shelf width → same SKU for RIPIANO
    const cfg = buildConfiguration({
      status: 'DESIGN_IN_PROGRESS',
      category: 'TONDO',
      columnPlan: {
        columnCount: 2,
        columns: [
          { index: 0, shelfWidthMm: 800 },
          { index: 1, shelfWidthMm: 800 },
        ],
      },
      columnDesigns: [
        { columnIndex: 0, levelsMm: [120, 440], shelfThicknessMm: 20 },
        { columnIndex: 1, levelsMm: [120, 440], shelfThicknessMm: 20 },
      ],
    });

    const bom = deriveBom(cfg, buildCatalogRules());

    const ripianoEntries = bom.filter((b) => b.componentType === 'RIPIANO');
    // Same SKU → should be aggregated into 1 entry with quantity 4
    expect(ripianoEntries).toHaveLength(1);
    expect(ripianoEntries[0].quantity).toBe(4);
    expect(ripianoEntries[0].sku).toBe('RIP-800');
  });

  it('uses foot component matching first level height exactly', () => {
    const rules = buildCatalogRules({
      footHeightsMm: [80, 120],
      footByHeightMm: new Map([
        [80, { type: 'PIEDINO', sku: 'PIE-80', name: 'Piedino 80', priceCents: 450, widthMm: 40, heightMm: 80, depthMm: 40 }],
        [120, { type: 'PIEDINO', sku: 'PIE-120', name: 'Piedino 120', priceCents: 490, widthMm: 40, heightMm: 120, depthMm: 40 }],
      ]),
      defaultFoot: { type: 'PIEDINO', sku: 'PIE-120', name: 'Piedino 120', priceCents: 490, widthMm: 40, heightMm: 120, depthMm: 40 },
      uprightHeightsMm: [80, 120, 300, 400, 500],
      uprightByHeightMm: new Map([
        [80, { type: 'MONTANTE', sku: 'MON-80', name: 'Montante 80', priceCents: 890, widthMm: 40, heightMm: 80, depthMm: 40 }],
        [120, { type: 'MONTANTE', sku: 'MON-120', name: 'Montante 120', priceCents: 990, widthMm: 40, heightMm: 120, depthMm: 40 }],
        [300, { type: 'MONTANTE', sku: 'MON-300', name: 'Montante 300', priceCents: 1490, widthMm: 40, heightMm: 300, depthMm: 40 }],
        [400, { type: 'MONTANTE', sku: 'MON-400', name: 'Montante 400', priceCents: 1790, widthMm: 40, heightMm: 400, depthMm: 40 }],
        [500, { type: 'MONTANTE', sku: 'MON-500', name: 'Montante 500', priceCents: 1990, widthMm: 40, heightMm: 500, depthMm: 40 }],
      ]),
    });

    const cfg = buildConfiguration({
      status: 'DESIGN_IN_PROGRESS',
      category: 'TONDO',
      columnPlan: { columnCount: 1, columns: [{ index: 0, shelfWidthMm: 800 }] },
      columnDesigns: [{ columnIndex: 0, levelsMm: [80], shelfThicknessMm: 20 }],
    });

    const bom = deriveBom(cfg, rules);
    const feet = bom.filter((item) => item.componentType === 'PIEDINO');

    expect(feet).toHaveLength(1);
    expect(feet[0].sku).toBe('PIE-80');
    expect(feet[0].quantity).toBe(4);
  });
});
