import { Configuration } from '../../domain/entities/Configuration';
import {
  ResourceConflictError,
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import {
  ConfigurationDto,
  SetEnvironmentInput,
  toConfigurationDto,
} from '../types';
import { canAccessConfiguration } from '../access';

/** Write use case that sets environment boundaries and resets dependent steps. */
export class SetEnvironment {
  constructor(private readonly configurationRepository: ConfigurationRepository) {}

  async execute(input: SetEnvironmentInput): Promise<ConfigurationDto> {
    this.validateInput(input);

    const configuration = await this.loadOwnedConfiguration(input.id, input.ownerId);
    if (configuration.status === 'FINALIZED') {
      throw new ResourceConflictError('Cannot change environment for a finalized configuration');
    }

    const updated: Configuration = {
      ...configuration,
      environment: input.environment,
      columnPlan: null,
      columnDesigns: [],
      components: [],
      status: configuration.category ? 'CATEGORY_SELECTED' : 'ENVIRONMENT_DEFINED',
      version: configuration.version + 1,
      updatedAt: new Date(),
    };

    await this.configurationRepository.update(updated);
    return toConfigurationDto(updated);
  }

  private validateInput(input: SetEnvironmentInput): void {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    if (input.environment.maxWidthMm <= 0 || input.environment.maxHeightMm <= 0) {
      throw new ValidationError('Environment max dimensions must be > 0');
    }

    if (input.environment.minWidthMm <= 0 || input.environment.minHeightMm <= 0) {
      throw new ValidationError('Environment min dimensions must be > 0');
    }

    if (input.environment.minWidthMm > input.environment.maxWidthMm) {
      throw new ValidationError('minWidthMm cannot be greater than maxWidthMm');
    }

    if (input.environment.minHeightMm > input.environment.maxHeightMm) {
      throw new ValidationError('minHeightMm cannot be greater than maxHeightMm');
    }

    if (input.environment.unit !== 'mm') {
      throw new ValidationError('Environment unit must be mm');
    }
  }

  private async loadOwnedConfiguration(id: string, ownerId: string): Promise<Configuration> {
    const configuration = await this.configurationRepository.findById(id);
    if (!configuration || !canAccessConfiguration(configuration, ownerId)) {
      throw new ResourceNotFoundError('Configuration not found');
    }

    return configuration;
  }
}