import { ColumnDesign, ColumnPlan, Configuration } from '../../domain/entities/Configuration';
import {
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { CatalogRules, CatalogRulesProvider } from '../../domain/ports/CatalogRulesProvider';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import {
  buildCandidateGaps,
  computeNextLevelMm,
  resolveFirstLevelHeightsMm,
  validateColumnCandidate,
} from '../../domain/services/SpineModel';
import { resolveShelfRoles } from '../../domain/services/ShelfRoleResolver';
import { assertStep4LogicImplemented } from '../../domain/services/Step4LogicResolver';
import {
  ListNextOptionsInput,
  ListNextOptionsOutput,
  NextOptionDto,
} from '../types';
import { canAccessConfiguration } from '../access';

/**
 * Read use case for Step 4 (design): computes the candidate gaps for the *next shelf*
 * in a specific column.
 *
 * Why this exists:
 * - The frontend must not decide constraints on its own.
 * - The backend returns a complete option list with `allowed` and rejection reasons.
 * - The UI can therefore show transparent, constraint-driven choices.
 *
 * Validation model:
 * 1) structural validation (configuration ownership + setup completeness),
 * 2) candidate generation from catalog piece heights,
 * 3) shared-spine validation on the two affected spines,
 * 4) exact-fit validation for every segment created by the simulated insertion.
 */
export class ListNextOptions {
  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly catalogRulesProvider: CatalogRulesProvider,
  ) {}

  /**
   * Computes available gap options for one target column.
   *
   * Candidate source:
   * - First shelf in a column: `footHeightsMm`
   * - Following shelves: `uprightHeightsMm`
   *
   * Returned `heightMm` is the *gap* to add on top of the current column top,
   * not an absolute level.
   */
  async execute(input: ListNextOptionsInput): Promise<ListNextOptionsOutput> {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    if (!Number.isInteger(input.columnIndex) || input.columnIndex < 0) {
      throw new ValidationError('columnIndex must be a non-negative integer');
    }

    const configuration = await this.loadOwnedConfiguration(input.id, input.ownerId);
    if (!configuration.category || !configuration.columnPlan) {
      throw new ValidationError('Category and column plan must be defined before listing options');
    }
    assertStep4LogicImplemented(configuration.category);

    const columnPlan = configuration.columnPlan;

    const planColumn = columnPlan.columns.find((column) => column.index === input.columnIndex);
    if (!planColumn) {
      return {
        columnIndex: input.columnIndex,
        options: [],
        lookAhead: { feasible: false },
        version: configuration.version,
      };
    }

    const rules = await this.catalogRulesProvider.getRules(configuration.category, configuration.depthMm ?? undefined);
    if (!rules.shelfByWidthMm.get(planColumn.shelfWidthMm)) {
      throw new ValidationError(
        `No shelf rule found for width ${planColumn.shelfWidthMm} in category ${configuration.category}`,
      );
    }

    const byIndex = new Map<number, ColumnDesign>();
    for (const design of configuration.columnDesigns) {
      // Defensive normalization: keep levels ordered so all downstream checks
      // (base level, adjacency, look-ahead) observe deterministic geometry.
      byIndex.set(design.columnIndex, {
        ...design,
        levelsMm: [...design.levelsMm].sort((a, b) => a - b),
      });
    }

    const current = byIndex.get(input.columnIndex);
    const levels = current?.levelsMm ?? [];
    const firstLevelHeightsMm = resolveFirstLevelHeightsMm({
      footHeightsMm: rules.footHeightsMm,
      uprightHeightsMm: rules.uprightHeightsMm,
    });
    const sortedPlanColumns = [...columnPlan.columns].sort((left, right) => left.index - right.index);
    const columnLevels = sortedPlanColumns.map((column) => ({
      levelsMm: byIndex.get(column.index)?.levelsMm ?? [],
    }));
    const columnIndexInPlan = sortedPlanColumns.findIndex((column) => column.index === input.columnIndex);

    const isQuadro = configuration.category === 'QUADRO';
    const isKube = configuration.category === 'KUBE';

    // Candidates always include neighbor-anchored 'bridge' gaps: TONDO and
    // QUADRO both share the STANDARD spine model for feet/uprights/terminals.
    // KUBE additionally offers 'stacked' gaps built from 2+ uprights.
    const candidates = buildCandidateGaps(
      columnLevels,
      columnIndexInPlan,
      {
        footHeightsMm: rules.footHeightsMm,
        uprightHeightsMm: rules.uprightHeightsMm,
      },
      { allowStackedUprights: isKube },
    );

    // Evaluate each candidate independently and explain exactly why it is blocked.
    // This enables the UI to present a "disabled with reason" dropdown.
    const spineRules = {
      footHeightsMm: firstLevelHeightsMm,
      uprightHeightsMm: rules.uprightHeightsMm,
      terminalHeightsMm: rules.terminalHeightsMm,
      maxHeightMm: Number.MAX_SAFE_INTEGER,
    };

    const options: NextOptionDto[] = candidates.map(({ heightMm, kind }) => {
      if (heightMm <= 0 || !Number.isFinite(heightMm)) {
        return {
          heightMm,
          allowed: false,
          kind,
          reasonCode: 'INVALID_GAP',
          reason: 'Gap height must be positive',
        };
      }

      if (isQuadro) {
        // QUADRO: a candidate that would land on the same level as a neighbor
        // is only allowed if the resulting BORDO/INTERMEDIO cluster is fully
        // covered by the catalog — checked before the geometric validation.
        const nextLevelMm = computeNextLevelMm({ existingLevelsMm: levels, candidateHeightMm: heightMm });
        const sharesWithNeighbor =
          (columnLevels[columnIndexInPlan - 1]?.levelsMm ?? []).includes(nextLevelMm)
          || (columnLevels[columnIndexInPlan + 1]?.levelsMm ?? []).includes(nextLevelMm);

        if (sharesWithNeighbor) {
          const simulatedLevels = columnLevels.map((column, position) =>
            position === columnIndexInPlan
              ? { levelsMm: [...column.levelsMm, nextLevelMm] }
              : column,
          );
          const roles = resolveShelfRoles(simulatedLevels);
          const missing: string[] = [];
          simulatedLevels.forEach((_, position) => {
            const role = roles.get(position)?.get(nextLevelMm);
            if (!role || role === 'NORMALE') {
              return;
            }
            const shelfWidthMm = sortedPlanColumns[position]?.shelfWidthMm;
            const shelfMap = role === 'BORDO' ? rules.bordoByWidthMm : rules.intermezzoByWidthMm;
            if (shelfWidthMm != null && !shelfMap.get(shelfWidthMm)) {
              missing.push(`${role}@${shelfWidthMm}mm`);
            }
          });

          if (missing.length > 0) {
            return {
              heightMm,
              allowed: false,
              kind,
              reasonCode: 'INTELLIGENTE_CATALOG_MISSING',
              reason: `Missing catalog shelf for: ${missing.join(', ')}`,
            };
          }
        }
      }

      const validation = validateColumnCandidate(
        columnLevels,
        columnIndexInPlan,
        heightMm,
        spineRules,
        { blockSharedLevel: !isQuadro, allowStackedUprights: isKube },
      );

      if (!validation.valid) {
        return {
          heightMm,
          allowed: false,
          kind,
          reasonCode: validation.reasonCode ?? 'SPINE_CONFLICT',
          reason: validation.reason ?? 'This choice violates shared-spine constraints',
        };
      }

      return {
        heightMm,
        allowed: true,
        kind,
      };
    });

    return {
      columnIndex: input.columnIndex,
      options,
      lookAhead: {
        feasible: options.some((option) => option.allowed),
      },
      version: configuration.version,
    };
  }

  private async loadOwnedConfiguration(id: string, ownerId: string): Promise<Configuration> {
    const configuration = await this.configurationRepository.findById(id);
    if (!configuration || !canAccessConfiguration(configuration, ownerId)) {
      throw new ResourceNotFoundError('Configuration not found');
    }

    return configuration;
  }
}
