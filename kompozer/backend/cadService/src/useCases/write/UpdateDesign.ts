import { ColumnDesign, ColumnPlan, Configuration } from '../../domain/entities/Configuration';
import {
  ResourceConflictError,
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import {
  ConfigurationDto,
  UpdateDesignInput,
  toConfigurationDto,
} from '../types';
import { CatalogRules, CatalogRulesProvider } from '../../domain/ports/CatalogRulesProvider';
import { deriveBom } from '../../domain/services/deriveBom';
import {
  resolveFirstLevelHeightsMm,
  SHELF_THICKNESS_MM,
  validateColumnDesigns,
} from '../../domain/services/SpineModel';
import { assertStep4LogicImplemented } from '../../domain/services/Step4LogicResolver';

/**
 * Write use case for Step 4 (design): validates and persists column shelf levels.
 *
 * Responsibilities:
 * - enforce geometric/domain constraints for every submitted column design,
 * - validate the merged shared spines induced by adjacent columns,
 * - keep shelf thickness server-driven and constant,
 * - derive BOM preview and promote status when configuration becomes finalizable.
 *
 * Important design choice:
 * This use case validates the *entire* submitted `columnDesigns` snapshot.
 * The frontend may execute add/remove operations, but backend remains source of truth.
 */
export class UpdateDesign {
  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly catalogRulesProvider: CatalogRulesProvider,
  ) {}

  /**
   * Validates a full design snapshot and saves it.
   *
   * Status transitions:
   * - no designs -> `COLUMNS_DEFINED`
   * - designs present -> `DESIGN_IN_PROGRESS`
   * - designs present + BOM derived -> `READY_FOR_FINALIZE`
   */
  async execute(input: UpdateDesignInput): Promise<ConfigurationDto> {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    const configuration = await this.loadOwnedConfiguration(input.id, input.ownerId);
    if (configuration.status === 'FINALIZED') {
      throw new ResourceConflictError('Cannot change design for a finalized configuration');
    }

    if (!configuration.environment || !configuration.category || !configuration.columnPlan) {
      throw new ResourceConflictError('Environment, category and column plan must be defined before design');
    }

    assertStep4LogicImplemented(configuration.category);

    const rules = await this.catalogRulesProvider.getRules(configuration.category);
    const normalizedDesigns = input.columnDesigns.map((design) => ({
      ...design,
      shelfThicknessMm: SHELF_THICKNESS_MM,
    }));

    const validIndices = new Set(configuration.columnPlan.columns.map((column) => column.index));
    const seen = new Set<number>();
    const byIndex = new Map<number, ColumnDesign>();

    // Per-column validation: structure, dimensions, monotonic levels and global height.
    for (const design of normalizedDesigns) {
      if (!validIndices.has(design.columnIndex)) {
        throw new ValidationError('columnDesign references an unknown column index');
      }
      if (seen.has(design.columnIndex)) {
        throw new ValidationError('columnDesigns must have unique columnIndex values');
      }
      seen.add(design.columnIndex);

      const columnPlanItem = configuration.columnPlan.columns.find(
        (column) => column.index === design.columnIndex,
      );
      if (!columnPlanItem) {
        throw new ValidationError('columnDesign references an unknown column index');
      }

      const shelfRule = rules.shelfByWidthMm.get(columnPlanItem.shelfWidthMm);
      if (!shelfRule) {
        throw new ValidationError(
          `No shelf rule found for width ${columnPlanItem.shelfWidthMm} in category ${configuration.category}`,
        );
      }

      if (design.shelfThicknessMm !== SHELF_THICKNESS_MM) {
        throw new ValidationError(
          `column ${design.columnIndex} shelfThicknessMm must match shelf thickness ${SHELF_THICKNESS_MM}`,
        );
      }

      // Levels are absolute heights from floor and must strictly increase.
      this.ensureStrictlyIncreasingLevels(design.columnIndex, design.levelsMm);

      byIndex.set(design.columnIndex, design);
    }

    const sortedColumns = [...configuration.columnPlan.columns].sort((left, right) => left.index - right.index);
    const validation = validateColumnDesigns(
      sortedColumns.map((column) => ({
        levelsMm: byIndex.get(column.index)?.levelsMm ?? [],
      })),
      {
        footHeightsMm: resolveFirstLevelHeightsMm({
          footHeightsMm: rules.footHeightsMm,
          uprightHeightsMm: rules.uprightHeightsMm,
        }),
        uprightHeightsMm: rules.uprightHeightsMm,
        terminalHeightsMm: rules.terminalHeightsMm,
        maxHeightMm: configuration.environment.maxHeightMm,
      },
    );
    if (!validation.valid) {
      throw new ValidationError(
        validation.reason
          ? `spine ${validation.spineIndex} is invalid: ${validation.reason}`
          : `spine ${validation.spineIndex} is invalid`,
      );
    }

    const updated: Configuration = {
      ...configuration,
      columnDesigns: normalizedDesigns,
      status: normalizedDesigns.length > 0 ? 'DESIGN_IN_PROGRESS' : 'COLUMNS_DEFINED',
      version: configuration.version + 1,
      updatedAt: new Date(),
      components: [],
    };

    // Derive BOM if design is complete
    if (normalizedDesigns.length > 0) {
      try {
        updated.components = deriveBom(updated, rules);
      } catch (err) {
        // If deriveBom fails (missing catalog rules, etc.), leave components empty
        // This is a graceful fallback; the configuration is still valid geometrically
      }

      if (updated.components.length > 0) {
        updated.status = 'READY_FOR_FINALIZE';
      }
    }

    await this.configurationRepository.update(updated);
    return toConfigurationDto(updated);
  }

  /**
   * Enforces strictly increasing positive levels in a single column.
   *
   * Levels are absolute Y coordinates (mm from floor), therefore duplicates
   * or descending values are invalid by definition.
   */
  private ensureStrictlyIncreasingLevels(columnIndex: number, levelsMm: number[]): void {
    let previous = 0;
    for (const level of levelsMm) {
      if (!Number.isFinite(level) || level <= 0) {
        throw new ValidationError(`column ${columnIndex} levels must be positive numbers`);
      }
      if (level <= previous) {
        throw new ValidationError(`column ${columnIndex} levels must be strictly increasing`);
      }
      previous = level;
    }
  }

  private async loadOwnedConfiguration(id: string, ownerId: string): Promise<Configuration> {
    const configuration = await this.configurationRepository.findById(id);
    if (!configuration || configuration.ownerId !== ownerId) {
      throw new ResourceNotFoundError('Configuration not found');
    }

    return configuration;
  }
}