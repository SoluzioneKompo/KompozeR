import { Configuration } from '../entities/Configuration';
import { BomItem } from '../entities/Bom';
import { ValidationError } from '../entities/errors';
import { CatalogRules } from '../ports/CatalogRulesProvider';
import {
  SPINE_COMPONENT_MULTIPLIER,
  buildSpines,
  deriveSpineBom,
  resolveFirstLevelHeightsMm,
} from './SpineModel';

/**
 * Derives the Bill of Materials (BOM) from a finalized CAD configuration.
 *
 * Rules:
 * - RIPIANO:   1 per level per column (from shelfByWidthMm).
 * - Spine components are counted per shared spine, not per column.
 * - PIEDINO:   2 per non-empty spine (front + back).
 * - TERMINALE: 2 per non-empty spine (front + back).
 * - MONTANTE:  2 per exact-fit spine segment (front + back).
 * - KUBE:      treated like every other system for now.
 *
 * Aggregation: items with the same SKU are summed before returning.
 */
export function deriveBom(configuration: Configuration, rules: CatalogRules): BomItem[] {
  const { category, columnPlan, columnDesigns } = configuration;

  if (!columnPlan || !category) {
    throw new ValidationError('Configuration must have a column plan and category to derive BOM');
  }

  const accumulator = new Map<string, BomItem>();

  function add(
    sku: string,
    name: string,
    quantity: number,
    unitPriceCents: number,
    componentType: BomItem['componentType'],
  ): void {
    const existing = accumulator.get(sku);
    if (existing) {
      existing.quantity += quantity;
      return;
    }

    accumulator.set(sku, { sku, name, quantity, unitPriceCents, componentType });
  }

  const sortedColumns = [...columnPlan.columns].sort((a, b) => a.index - b.index);
  const outerIndices = new Set<number>([
    sortedColumns[0]?.index ?? -1,
    sortedColumns[sortedColumns.length - 1]?.index ?? -1,
  ]);

  for (const column of sortedColumns) {
    const design = columnDesigns.find((item) => item.columnIndex === column.index);
    if (!design || design.levelsMm.length === 0) {
      continue;
    }

    if (category === 'INTELLIGENTE') {
      const isOuter = outerIndices.has(column.index);
      const shelfRule = isOuter
        ? rules.bordoByWidthMm.get(column.shelfWidthMm)
        : rules.intermezzoByWidthMm.get(column.shelfWidthMm);
      if (!shelfRule) {
        throw new ValidationError(
          `No catalog ${isOuter ? 'BORDO' : 'INTERMEZZO'} shelf found for widthMm=${column.shelfWidthMm} in column ${column.index}`,
        );
      }
      add(shelfRule.sku, shelfRule.name, design.levelsMm.length, shelfRule.priceCents, isOuter ? 'RIPIANO_BORDO' : 'RIPIANO_INTERMEDIO');
    } else {
      const shelfRule = rules.shelfByWidthMm.get(column.shelfWidthMm);
      if (!shelfRule) {
        throw new ValidationError(
          `No catalog shelf found for widthMm=${column.shelfWidthMm} in column ${column.index}`,
        );
      }
      add(shelfRule.sku, shelfRule.name, design.levelsMm.length, shelfRule.priceCents, 'RIPIANO');
    }
  }

  if (!rules.defaultFoot) {
    throw new ValidationError('No PIEDINO available in catalog rules for selected category');
  }

  if (!rules.defaultTerminal) {
    throw new ValidationError('No TERMINALE available in catalog rules for selected category');
  }

  const spines = buildSpines(
    sortedColumns.map((column) => {
      const design = columnDesigns.find((item) => item.columnIndex === column.index);
      return {
        levelsMm: design?.levelsMm ?? [],
      };
    }),
  );

  for (const spine of spines) {
    const spineBom = deriveSpineBom(spine.levelsMm, {
      footHeightsMm: resolveFirstLevelHeightsMm({
        footHeightsMm: rules.footHeightsMm,
        uprightHeightsMm: rules.uprightHeightsMm,
      }),
      uprightHeightsMm: rules.uprightHeightsMm,
      terminalHeightsMm: rules.terminalHeightsMm,
      maxHeightMm: configuration.environment?.maxHeightMm ?? Number.MAX_SAFE_INTEGER,
    });

    if (!spineBom) {
      if (spine.levelsMm.length === 0) {
        continue;
      }

      throw new ValidationError(`Cannot derive BOM for invalid spine ${spine.index}`);
    }

    const footRule = rules.footByHeightMm.get(spineBom.footHeightMm);
    if (!footRule) {
      throw new ValidationError(`No PIEDINO found for exact height ${spineBom.footHeightMm}mm`);
    }

    add(
      footRule.sku,
      footRule.name,
      SPINE_COMPONENT_MULTIPLIER,
      footRule.priceCents,
      'PIEDINO',
    );
    add(
      rules.defaultTerminal.sku,
      rules.defaultTerminal.name,
      SPINE_COMPONENT_MULTIPLIER,
      rules.defaultTerminal.priceCents,
      'TERMINALE',
    );

    for (const gapMm of spineBom.uprightHeightsMm) {
      const uprightRule = rules.uprightByHeightMm.get(gapMm);
      if (!uprightRule) {
        throw new ValidationError(`No MONTANTE found for exact spine segment=${gapMm}mm`);
      }

      add(
        uprightRule.sku,
        uprightRule.name,
        SPINE_COMPONENT_MULTIPLIER,
        uprightRule.priceCents,
        'MONTANTE',
      );
    }
  }

  return [...accumulator.values()].filter((item) => item.quantity > 0);
}
