import { randomUUID } from 'crypto';
import {
  Configuration,
  validateConfigurationModel,
} from '../../domain/entities/Configuration';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import { ValidationError } from '../../domain/entities/errors';
import {
  ConfigurationDto,
  CreateConfigurationInput,
  toConfigurationDto,
} from '../types';

/** Write use case that starts a new draft configuration for one owner. */
export class CreateConfiguration {
  constructor(private readonly configurationRepository: ConfigurationRepository) {}

  async execute(input: CreateConfigurationInput): Promise<ConfigurationDto> {
    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    const now = new Date();
    const configuration: Configuration = {
      id: `cfg_${randomUUID()}`,
      ownerId: input.ownerId,
      collaborators: [],
      name: input.name?.trim() || 'Nuova configurazione',
      status: 'DRAFT',
      category: input.category ?? null,
      environment: null,
      columnPlan: null,
      columnDesigns: [],
      components: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    validateConfigurationModel(configuration);
    await this.configurationRepository.save(configuration);

    return toConfigurationDto(configuration);
  }
}
