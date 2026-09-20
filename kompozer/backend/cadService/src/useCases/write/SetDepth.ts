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
  SetDepthInput,
  toConfigurationDto,
} from '../types';
import { canAccessConfiguration } from '../access';

/**
 * Write use case for the depth-selection step: picked right after category,
 * before the column plan. Changing depth after a column plan/design already
 * exists resets them, same as changing the category.
 */
export class SetDepth {
  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly catalogRulesProvider: CatalogRulesProvider,
  ) {}

  async execute(input: SetDepthInput): Promise<ConfigurationDto> {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    if (!Number.isFinite(input.depthMm) || input.depthMm <= 0) {
      throw new ValidationError('depthMm must be a positive number');
    }

    const configuration = await this.loadOwnedConfiguration(input.id, input.ownerId);
    if (configuration.status === 'FINALIZED') {
      throw new ResourceConflictError('Cannot change depth for a finalized configuration');
    }

    if (!configuration.category) {
      throw new ResourceConflictError('Category must be defined before depth');
    }

    const availableDepthsMm = await this.catalogRulesProvider.getAvailableDepthsMm(configuration.category);
    if (!availableDepthsMm.includes(input.depthMm)) {
      throw new ValidationError(
        `depthMm ${input.depthMm} is not available for category ${configuration.category}`,
      );
    }

    const designExisted = configuration.columnDesigns.length > 0 || configuration.columnPlan != null;

    const updated: Configuration = {
      ...configuration,
      depthMm: input.depthMm,
      columnPlan: designExisted ? null : configuration.columnPlan,
      columnDesigns: designExisted ? [] : configuration.columnDesigns,
      terminalSelections: designExisted ? [] : configuration.terminalSelections,
      components: [],
      status: designExisted ? 'CATEGORY_SELECTED' : configuration.status,
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
