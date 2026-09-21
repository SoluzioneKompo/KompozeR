import { Configuration } from '../../domain/entities/Configuration';
import {
  ResourceConflictError,
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import {
  ConfigurationDto,
  ResetConfigurationInput,
  toConfigurationDto,
} from '../types';
import { canAccessConfiguration } from '../access';

/**
 * Write use case backing the "reset configuration" button: clears column plan,
 * design and derived BOM while keeping the already-selected category, so the
 * user redoes columns/design without picking a category again.
 */
export class ResetConfiguration {
  constructor(private readonly configurationRepository: ConfigurationRepository) {}

  async execute(input: ResetConfigurationInput): Promise<ConfigurationDto> {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    const configuration = await this.loadOwnedConfiguration(input.id, input.ownerId);
    if (configuration.status === 'FINALIZED') {
      throw new ResourceConflictError('Cannot reset a finalized configuration');
    }

    if (!configuration.category) {
      throw new ResourceConflictError('Nothing to reset before a category is selected');
    }

    const updated: Configuration = {
      ...configuration,
      columnPlan: null,
      columnDesigns: [],
      terminalSelections: [],
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
