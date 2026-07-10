import {
  ResourceNotFoundError,
  ValidationError,
} from '../../domain/entities/errors';
import { CartServiceClient } from '../../domain/ports/CartServiceClient';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import { ConfigurationDto, toConfigurationDto } from '../types';
import { canAccessConfiguration } from '../access';

export interface ReorderConfigurationInput {
  id: string;
  ownerId: string;
}

/**
 * Re-pushes the BOM of a previously FINALIZED configuration to the cart.
 * Does NOT change the configuration status or version — it is a pure re-order action.
 */
export class ReorderConfiguration {
  constructor(
    private readonly configurationRepository: ConfigurationRepository,
    private readonly cartServiceClient: CartServiceClient,
  ) {}

  async execute(input: ReorderConfigurationInput): Promise<ConfigurationDto> {
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

    if (configuration.status !== 'FINALIZED') {
      throw new ValidationError('Only FINALIZED configurations can be re-ordered');
    }

    if (configuration.components.length === 0) {
      throw new ValidationError('Configuration has no components to re-order');
    }

    await this.cartServiceClient.pushBomToCart(configuration.ownerId, configuration.components);

    return toConfigurationDto(configuration);
  }
}
