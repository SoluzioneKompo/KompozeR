import { ColumnDesign, ColumnPlan, Configuration } from '../../domain/entities/Configuration';
import {
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { CatalogRules, CatalogRulesProvider } from '../../domain/ports/CatalogRulesProvider';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import {
  computeNextLevelMm,
  resolveFirstLevelHeightsMm,
  validateColumnCandidate,
  validateSpine,
} from '../../domain/services/SpineModel';
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
    if (!configuration.environment || !configuration.category || !configuration.columnPlan) {
      throw new ValidationError('Environment, category and column plan must be defined before listing options');
    }
    assertStep4LogicImplemented(configuration.category);

    const environment = configuration.environment;
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

    const rules = await this.catalogRulesProvider.getRules(configuration.category);
    if (configuration.category === 'INTELLIGENTE') {
      const sortedColumnPlanIndices = [...columnPlan.columns]
        .sort((a, b) => a.index - b.index)
        .map((c) => c.index);
      const isOuterColumn =
        input.columnIndex === sortedColumnPlanIndices[0] ||
        input.columnIndex === sortedColumnPlanIndices[sortedColumnPlanIndices.length - 1];
      const shelfMap = isOuterColumn ? rules.bordoByWidthMm : rules.intermezzoByWidthMm;
      if (!shelfMap.get(planColumn.shelfWidthMm)) {
        throw new ValidationError(
          `No ${isOuterColumn ? 'BORDO' : 'INTERMEZZO'} shelf rule found for width ${planColumn.shelfWidthMm} in INTELLIGENTE`,
        );
      }
    } else if (!rules.shelfByWidthMm.get(planColumn.shelfWidthMm)) {
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
    const candidates = levels.length === 0 ? firstLevelHeightsMm : rules.uprightHeightsMm;
    const columnLevels = [...columnPlan.columns]
      .sort((left, right) => left.index - right.index)
      .map((column) => ({
        levelsMm: byIndex.get(column.index)?.levelsMm ?? [],
      }));

    // Evaluate each candidate independently and explain exactly why it is blocked.
    // This enables the UI to present a "disabled with reason" dropdown.
    const spineRules = {
      footHeightsMm: firstLevelHeightsMm,
      uprightHeightsMm: rules.uprightHeightsMm,
      terminalHeightsMm: rules.terminalHeightsMm,
      maxHeightMm: environment.maxHeightMm,
    };

    const options: NextOptionDto[] = candidates.map((heightMm) => {
      if (heightMm <= 0 || !Number.isFinite(heightMm)) {
        return {
          heightMm,
          allowed: false,
          reasonCode: 'INVALID_GAP',
          reason: 'Gap height must be positive',
        };
      }

      let validation;
      if (configuration.category === 'INTELLIGENTE') {
        // INTELLIGENTE: no shared-spine adjacency — validate target column alone
        const nextLevelMm = computeNextLevelMm({ existingLevelsMm: levels, candidateHeightMm: heightMm });
        validation = validateSpine([...levels, nextLevelMm], spineRules);
      } else {
        const columnIndexInPlan = [...columnPlan.columns]
          .sort((left, right) => left.index - right.index)
          .findIndex((column) => column.index === input.columnIndex);
        validation = validateColumnCandidate(columnLevels, columnIndexInPlan, heightMm, spineRules);
      }

      if (!validation.valid) {
        return {
          heightMm,
          allowed: false,
          reasonCode: validation.reasonCode ?? 'SPINE_CONFLICT',
          reason: validation.reason ?? 'This choice violates shared-spine constraints',
        };
      }

      return {
        heightMm,
        allowed: true,
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
