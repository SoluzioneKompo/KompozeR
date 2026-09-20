import { Configuration } from '../entities/Configuration';
import { BomItem } from '../entities/Bom';
import { ValidationError } from '../entities/errors';
import { CatalogRules } from '../ports/CatalogRulesProvider';
import {
  SPINE_COMPONENT_MULTIPLIER,
  buildSpines,
  composeUprightBreakdown,
  deriveSpineBom,
  resolveFirstLevelHeightsMm,
} from './SpineModel';
import { resolveShelfRoles } from './ShelfRoleResolver';

/**
 * Derives the Bill of Materials (BOM) from a finalized CAD configuration.
 *
 * Rules:
 * - RIPIANO:   1 per level per column (from shelfByWidthMm).
 * - QUADRO:    1 shelf per level per column, but its type (RIPIANO / RIPIANO_BORDO /
 *              RIPIANO_INTERMEDIO) depends on whether that level is shared with
 *              index-adjacent columns — see ShelfRoleResolver.resolveShelfRoles.
 * - Spine components are counted per shared spine, not per column.
 * - PIEDINO:   2 per non-empty spine (front + back).
 * - TERMINALE: 2 per non-empty spine (front + back).
 * - MONTANTE:  2 per exact-fit spine segment (front + back). For KUBE, a
 *              segment that has no single matching catalog upright is
 *              decomposed into the minimum-piece stack that sums to it (see
 *              SpineModel.composeUprightBreakdown), and each piece gets its
 *              own 2-per-spine count.
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

  if (category === 'QUADRO') {
    const levelsByPosition = sortedColumns.map((column) => {
      const design = columnDesigns.find((item) => item.columnIndex === column.index);
      return { levelsMm: design?.levelsMm ?? [] };
    });
    const roles = resolveShelfRoles(levelsByPosition);

    sortedColumns.forEach((column, position) => {
      const design = columnDesigns.find((item) => item.columnIndex === column.index);
      if (!design || design.levelsMm.length === 0) {
        return;
      }

      const rolesForColumn = roles.get(position) ?? new Map();
      for (const levelMm of design.levelsMm) {
        const role = rolesForColumn.get(levelMm) ?? 'NORMALE';
        if (role === 'NORMALE') {
          const shelfRule = rules.shelfByWidthMm.get(column.shelfWidthMm);
          if (!shelfRule) {
            throw new ValidationError(
              `No catalog shelf found for widthMm=${column.shelfWidthMm} in column ${column.index}`,
            );
          }
          add(shelfRule.sku, shelfRule.name, 1, shelfRule.priceCents, 'RIPIANO');
        } else {
          const map = role === 'BORDO' ? rules.bordoByWidthMm : rules.intermezzoByWidthMm;
          const shelfRule = map.get(column.shelfWidthMm);
          if (!shelfRule) {
            throw new ValidationError(
              `No catalog ${role} shelf found for widthMm=${column.shelfWidthMm} in column ${column.index} at level ${levelMm}mm`,
            );
          }
          add(
            shelfRule.sku,
            shelfRule.name,
            1,
            shelfRule.priceCents,
            role === 'BORDO' ? 'RIPIANO_BORDO' : 'RIPIANO_INTERMEDIO',
          );
        }
      }
    });
  } else {
    for (const column of sortedColumns) {
      const design = columnDesigns.find((item) => item.columnIndex === column.index);
      if (!design || design.levelsMm.length === 0) {
        continue;
      }

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

  const terminalHeightBySpineIndex = new Map(
    configuration.terminalSelections.map((selection) => [selection.spineIndex, selection.heightMm]),
  );

  const spines = buildSpines(
    sortedColumns.map((column) => {
      const design = columnDesigns.find((item) => item.columnIndex === column.index);
      return {
        levelsMm: design?.levelsMm ?? [],
      };
    }),
  );

  const allowStackedUprights = category === 'KUBE';

  for (const spine of spines) {
    const spineBom = deriveSpineBom(
      spine.levelsMm,
      {
        footHeightsMm: resolveFirstLevelHeightsMm({
          footHeightsMm: rules.footHeightsMm,
          uprightHeightsMm: rules.uprightHeightsMm,
        }),
        uprightHeightsMm: rules.uprightHeightsMm,
        terminalHeightsMm: rules.terminalHeightsMm,
        maxHeightMm: Number.MAX_SAFE_INTEGER,
      },
      terminalHeightBySpineIndex.get(spine.index),
      { allowStackedUprights },
    );

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

    const terminalRule = rules.terminalByHeightMm.get(spineBom.terminalHeightMm) ?? rules.defaultTerminal;

    add(
      footRule.sku,
      footRule.name,
      SPINE_COMPONENT_MULTIPLIER,
      footRule.priceCents,
      'PIEDINO',
    );
    add(
      terminalRule.sku,
      terminalRule.name,
      SPINE_COMPONENT_MULTIPLIER,
      terminalRule.priceCents,
      'TERMINALE',
    );

    for (const gapMm of spineBom.uprightHeightsMm) {
      const pieceHeightsMm = allowStackedUprights
        ? composeUprightBreakdown(gapMm, rules.uprightHeightsMm)
        : rules.uprightByHeightMm.has(gapMm)
          ? [gapMm]
          : null;

      if (!pieceHeightsMm) {
        throw new ValidationError(`No MONTANTE combination found for spine segment=${gapMm}mm`);
      }

      for (const pieceHeightMm of pieceHeightsMm) {
        const uprightRule = rules.uprightByHeightMm.get(pieceHeightMm);
        if (!uprightRule) {
          throw new ValidationError(`No MONTANTE found for exact height=${pieceHeightMm}mm`);
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
  }

  return [...accumulator.values()].filter((item) => item.quantity > 0);
}
