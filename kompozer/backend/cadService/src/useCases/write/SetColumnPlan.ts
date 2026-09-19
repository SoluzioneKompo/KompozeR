import { Configuration } from '../../domain/entities/Configuration';
import {
  ResourceConflictError,
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { CatalogRulesProvider } from '../../domain/ports/CatalogRulesProvider';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import {
  ConfigurationDto,
  SetColumnPlanInput,
  toConfigurationDto,
} from '../types';
import { canAccessConfiguration } from '../access';

/** Write use case that validates and stores the selected column layout. */
export class SetColumnPlan {
  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly catalogRulesProvider: CatalogRulesProvider,
  ) {}

  async execute(input: SetColumnPlanInput): Promise<ConfigurationDto> {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    if (input.columnPlan.columnCount <= 0) {
      throw new ValidationError('columnCount must be > 0');
    }

    if (input.columnPlan.columns.length !== input.columnPlan.columnCount) {
      throw new ValidationError('columnCount must match columns length');
    }

    const configuration = await this.loadOwnedConfiguration(input.id, input.ownerId);
    if (configuration.status === 'FINALIZED') {
      throw new ResourceConflictError('Cannot change column plan for a finalized configuration');
    }

    if (!configuration.category) {
      throw new ResourceConflictError('Category must be defined before column plan');
    }

    // Changing the plan (column count or widths) after a design already exists
    // invalidates that design — the caller (UI) is expected to confirm this with
    // the user before calling; the backend just enforces the reset itself.
    const designExisted = configuration.columnDesigns.length > 0;

    const rules = await this.catalogRulesProvider.getRules(configuration.category);
    const seen = new Set<number>();

    // Step2 only fixes each column's width; adjacency (and therefore whether a
    // level later becomes a QUADRO BORDO/INTERMEDIO shelf) is only known once
    // levels are designed in Step4, so here every category validates against
    // the plain RIPIANO width map.
    for (const column of input.columnPlan.columns) {
      if (column.index < 0) {
        throw new ValidationError('column index must be >= 0');
      }
      if (seen.has(column.index)) {
        throw new ValidationError('column indexes must be unique');
      }
      seen.add(column.index);

      if (column.shelfWidthMm <= 0) {
        throw new ValidationError('column shelfWidthMm must be > 0');
      }
      if (!rules.shelfByWidthMm.has(column.shelfWidthMm)) {
        throw new ValidationError(
          `column shelfWidthMm ${column.shelfWidthMm} is not available for category ${configuration.category}`,
        );
      }
    }

    const updated: Configuration = {
      ...configuration,
      columnPlan: input.columnPlan,
      columnDesigns: designExisted ? [] : configuration.columnDesigns,
      terminalSelections: designExisted ? [] : configuration.terminalSelections,
      components: [],
      status: 'COLUMNS_DEFINED',
      version: configuration.version + 1,
      updatedAt: new Date(),
    };

    await this.configurationRepository.update(updated);
    return toConfigurationDto(updated);
  }

  private async loadOwnedConfiguration(id: string, ownerId: string): Promise<Configuration> {
    const configuration = await this.configurationRepository.findById(id);
    if (!configuration || !canAccessConfiguration(configuration, ownerId)) {
      throw new ResourceNotFoundError('Configuration not found');
    }

    return configuration;
  }
}