import { CONFIGURATION_STATUSES, ConfigurationStatus } from '../../domain/entities/ConfigurationStatus';
import { ValidationError } from '../../domain/entities/errors';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import { ConfigurationDto, toConfigurationDto } from '../types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListConfigurationsInput {
  ownerId: string;
  status?: ConfigurationStatus;
  page?: number;
  limit?: number;
}

export interface ListConfigurationsOutput {
  items: ConfigurationDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Read use case that lists owned configurations with optional status filtering. */
export class ListConfigurations {
  constructor(private readonly configurationRepository: ConfigurationRepository) {}

  async execute(input: ListConfigurationsInput): Promise<ListConfigurationsOutput> {
    if (!input.ownerId?.trim()) {
      throw new ValidationError('ownerId is required');
    }

    if (input.status && !CONFIGURATION_STATUSES.includes(input.status)) {
      throw new ValidationError('status is invalid');
    }

    const pageValue = Number.isFinite(input.page) ? (input.page as number) : DEFAULT_PAGE;
    const limitValue = Number.isFinite(input.limit) ? (input.limit as number) : DEFAULT_LIMIT;

    const page = Math.max(1, pageValue);
    const limit = Math.min(MAX_LIMIT, Math.max(1, limitValue));

    const all = await this.configurationRepository.findAccessibleByUser(input.ownerId);
    const filtered = input.status
      ? all.filter((configuration) => configuration.status === input.status)
      : all;

    const sorted = filtered.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );

    const start = (page - 1) * limit;
    const items = sorted.slice(start, start + limit).map(toConfigurationDto);

    return {
      items,
      total: sorted.length,
      page,
      limit,
      totalPages: Math.ceil(sorted.length / limit),
    };
  }
}
