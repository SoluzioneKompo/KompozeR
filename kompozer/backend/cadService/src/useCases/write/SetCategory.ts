import { Configuration } from '../../domain/entities/Configuration';
import {
  ResourceConflictError,
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import {
  ConfigurationDto,
  SetCategoryInput,
  toConfigurationDto,
} from '../types';
import { canAccessConfiguration } from '../access';

/** Write use case that sets system category after environment selection. */
export class SetCategory {
  constructor(private readonly configurationRepository: ConfigurationRepository) {}

  async execute(input: SetCategoryInput): Promise<ConfigurationDto> {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    const configuration = await this.loadOwnedConfiguration(input.id, input.ownerId);
    if (configuration.status === 'FINALIZED') {
      throw new ResourceConflictError('Cannot change category for a finalized configuration');
    }

    if (!configuration.environment) {
      throw new ResourceConflictError('Environment must be defined before category');
    }

    const updated: Configuration = {
      ...configuration,
      category: input.category,
      columnPlan: null,
      columnDesigns: [],
      components: [],
      status: 'CATEGORY_SELECTED',
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