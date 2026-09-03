import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import { CatalogRulesProvider } from '../../domain/ports/CatalogRulesProvider';
import { logger } from '../../infrastructure/logger';
import {
  GetConfigurationInput,
  ConfigurationDto,
  toConfigurationDto,
} from '../types';
import {
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { deriveBom } from '../../domain/services/deriveBom';
import { canAccessConfiguration } from '../access';

/** Read use case that returns one owned configuration by id. */
export class GetConfiguration {
  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly catalogRulesProvider?: CatalogRulesProvider,
  ) {}

  async execute(input: GetConfigurationInput): Promise<ConfigurationDto> {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    const configuration = await this.configurationRepository.findById(input.id);
    if (!configuration || !canAccessConfiguration(configuration, input.ownerId)) {
      throw new ResourceNotFoundError('Configuration not found');
    }

    // Lazy migration: if components are missing/empty but design is complete, rederive on-the-fly
    if (
      configuration.components.length === 0 &&
      configuration.columnDesigns.length > 0 &&
      configuration.category &&
      configuration.columnPlan &&
      this.catalogRulesProvider
    ) {
      try {
        logger.info(
          { event: 'cad.configuration.lazy_migration', configurationId: configuration.id },
          'Lazy migrating components for configuration',
        );
        const rules = await this.catalogRulesProvider.getRules(configuration.category);
        configuration.components = deriveBom(configuration, rules);
      } catch (err) {
        // Log but don't fail — return configuration as-is if deriveBom fails
        logger.error(
          { err, configurationId: configuration.id },
          'Lazy migration failed for configuration',
        );
      }
    }

    return toConfigurationDto(configuration);
  }
}
