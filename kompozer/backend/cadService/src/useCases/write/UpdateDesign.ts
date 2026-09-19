import { ColumnDesign, ColumnPlan, Configuration, TerminalSelection } from '../../domain/entities/Configuration';
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
import { resolveShelfRoles } from '../../domain/services/ShelfRoleResolver';
import { assertStep4LogicImplemented } from '../../domain/services/Step4LogicResolver';
import { canAccessConfiguration } from '../access';

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

    if (!configuration.category || !configuration.columnPlan) {
      throw new ResourceConflictError('Category and column plan must be defined before design');
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

    const spineRules = {
      footHeightsMm: resolveFirstLevelHeightsMm({
        footHeightsMm: rules.footHeightsMm,
        uprightHeightsMm: rules.uprightHeightsMm,
      }),
      uprightHeightsMm: rules.uprightHeightsMm,
      terminalHeightsMm: rules.terminalHeightsMm,
      maxHeightMm: Number.MAX_SAFE_INTEGER,
    };

    if (configuration.category === 'QUADRO') {
      const levelsByPosition = sortedColumns.map((col) => ({
        levelsMm: byIndex.get(col.index)?.levelsMm ?? [],
      }));
      const roles = resolveShelfRoles(levelsByPosition);

      // Verify catalog coverage for every non-NORMALE (column, level) BEFORE
      // accepting the shared level — an adjacency without catalog coverage is
      // rejected, it never falls back to a plain RIPIANO on a shared level.
      sortedColumns.forEach((col, position) => {
        const rolesForColumn = roles.get(position) ?? new Map();
        for (const [levelMm, role] of rolesForColumn) {
          if (role === 'NORMALE') continue;
          const shelfMap = role === 'BORDO' ? rules.bordoByWidthMm : rules.intermezzoByWidthMm;
          if (!shelfMap.get(col.shelfWidthMm)) {
            throw new ValidationError(
              `QUADRO: no ${role} shelf rule found for width ${col.shelfWidthMm}mm needed at column ${col.index}, level ${levelMm}mm (shared with an adjacent column)`,
            );
          }
        }
      });

      // Geometric validation stays a shared spine (like STANDARD), but a
      // shared level between adjacent columns is now allowed — catalog
      // coverage was already verified above.
      const validation = validateColumnDesigns(levelsByPosition, spineRules, { blockSharedLevel: false });
      if (!validation.valid) {
        throw new ValidationError(
          validation.reason
            ? `spine ${validation.spineIndex} is invalid: ${validation.reason}`
            : `spine ${validation.spineIndex} is invalid`,
        );
      }
    } else {
      const validation = validateColumnDesigns(
        sortedColumns.map((column) => ({
          levelsMm: byIndex.get(column.index)?.levelsMm ?? [],
        })),
        spineRules,
      );
      if (!validation.valid) {
        throw new ValidationError(
          validation.reason
            ? `spine ${validation.spineIndex} is invalid: ${validation.reason}`
            : `spine ${validation.spineIndex} is invalid`,
        );
      }
    }

    const terminalSelections = input.terminalSelections != null
      ? this.validateTerminalSelections(input.terminalSelections, configuration.columnPlan.columnCount, rules)
      : configuration.terminalSelections;

    const updated: Configuration = {
      ...configuration,
      columnDesigns: normalizedDesigns,
      terminalSelections,
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

  /**
   * Validates the full terminal-selection snapshot: spine indexes must reference
   * an existing spine (0..columnCount, inclusive of both outer spines) and heights
   * must be a catalog-available terminal height.
   */
  private validateTerminalSelections(
    selections: TerminalSelection[],
    columnCount: number,
    rules: CatalogRules,
  ): TerminalSelection[] {
    const seen = new Set<number>();
    for (const selection of selections) {
      if (!Number.isInteger(selection.spineIndex) || selection.spineIndex < 0 || selection.spineIndex > columnCount) {
        throw new ValidationError(`terminalSelection spineIndex ${selection.spineIndex} is out of range`);
      }
      if (seen.has(selection.spineIndex)) {
        throw new ValidationError('terminalSelections must have unique spineIndex values');
      }
      seen.add(selection.spineIndex);

      if (!rules.terminalHeightsMm.includes(selection.heightMm)) {
        throw new ValidationError(
          `terminalSelection heightMm ${selection.heightMm} is not an available TERMINALE height`,
        );
      }
    }

    return selections;
  }

  private async loadOwnedConfiguration(id: string, ownerId: string): Promise<Configuration> {
    const configuration = await this.configurationRepository.findById(id);
    if (!configuration || !canAccessConfiguration(configuration, ownerId)) {
      throw new ResourceNotFoundError('Configuration not found');
    }

    return configuration;
  }
}