import { Configuration } from '../../domain/entities/Configuration';
import {
  ResourceConflictError,
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { CartServiceClient } from '../../domain/ports/CartServiceClient';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import { NotificationSubscriptionClient } from '../../domain/ports/NotificationSubscriptionClient';
import {
  ConfigurationDto,
  FinalizeConfigurationInput,
  toConfigurationDto,
} from '../types';
import { canAccessConfiguration } from '../access';

/**
 * Write use case that finalizes a configuration and synchronizes its BOM externally.
 */
export class FinalizeConfiguration {
  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly cartServiceClient: CartServiceClient,
    private readonly notificationSubscriptionClient?: NotificationSubscriptionClient,
  ) {}

  async execute(input: FinalizeConfigurationInput): Promise<ConfigurationDto> {
    if (!input.id?.trim()) {
      throw new ValidationError('configurationId is required');
    }

    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    const configuration = await this.loadOwnedConfiguration(input.id, input.ownerId);
    if (configuration.status === 'FINALIZED') {
      throw new ResourceConflictError('Configuration is already finalized');
    }

    if (!configuration.environment || !configuration.category || !configuration.columnPlan) {
      throw new ResourceConflictError('Configuration setup is incomplete');
    }

    if (configuration.columnDesigns.length === 0) {
      throw new ValidationError('Configuration design is required before finalize');
    }

    // BOM is already persisted in configuration.components
    if (configuration.components.length === 0) {
      throw new ResourceConflictError('Configuration has no components to finalize');
    }

    await this.cartServiceClient.pushBomToCart(configuration.ownerId, configuration.components);

    const subscriptionClient = this.notificationSubscriptionClient;
    if (subscriptionClient) {
      const uniqueSkus = [...new Set(configuration.components.map((component) => component.sku))];
      await Promise.all(
        uniqueSkus.map((sku) =>
          subscriptionClient.ensureProductAvailabilitySubscription(
            configuration.ownerId,
            sku,
          )),
      );
    }

    const updated: Configuration = {
      ...configuration,
      status: 'FINALIZED',
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