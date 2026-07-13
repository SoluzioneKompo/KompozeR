import { Category } from '../domain/entities/Category';
import {
  ColumnDesign,
  ColumnPlan,
  Configuration,
  Environment,
} from '../domain/entities/Configuration';
import { ConfigurationStatus } from '../domain/entities/ConfigurationStatus';
import { BomItem } from '../domain/entities/Bom';
import { SpineReasonCode } from '../domain/services/SpineModel';

/** Input payload for draft configuration creation. */
export interface CreateConfigurationInput {
  ownerId: string;
  name?: string;
  category?: Category | null;
}

export interface ConfigurationDto {
  id: string;
  ownerId: string;
  collaborators: string[];
  name: string;
  status: ConfigurationStatus;
  category: Category | null;
  environment: Environment | null;
  columnPlan: ColumnPlan | null;
  columnDesigns: ColumnDesign[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  bom?: BomItem[];
}

/** Input payload for loading one configuration. */
export interface GetConfigurationInput {
  id: string;
  ownerId: string;
}

export interface ListConfigurationsInput {
  ownerId: string;
  status?: ConfigurationStatus;
  page?: number;
  limit?: number;
}

/** Paginated response for configuration listing endpoint. */
export interface ListConfigurationsOutput {
  items: ConfigurationDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Input payload for environment update step. */
export interface SetEnvironmentInput {
  id: string;
  ownerId: string;
  environment: Environment;
}

/** Input payload for category selection step. */
export interface SetCategoryInput {
  id: string;
  ownerId: string;
  category: Category;
}

/** Input payload for column-plan step. */
export interface SetColumnPlanInput {
  id: string;
  ownerId: string;
  columnPlan: ColumnPlan;
}

/** Input payload for full design snapshot update. */
export interface UpdateDesignInput {
  id: string;
  ownerId: string;
  columnDesigns: ColumnDesign[];
}

/** Input payload for finalize step. */
export interface FinalizeConfigurationInput {
  id: string;
  ownerId: string;
}

/** Input payload for next-options computation. */
export interface ListNextOptionsInput {
  id: string;
  ownerId: string;
  columnIndex: number;
}

export type NextOptionReasonCode = SpineReasonCode | 'INVALID_GAP' | 'SPINE_CONFLICT';

/** Candidate gap option returned for one design column. */
export interface NextOptionDto {
  heightMm: number;
  allowed: boolean;
  /** 'bridge' when the shelf spans a tall gap anchored to adjacent columns' joints. */
  kind?: 'standard' | 'bridge';
  reasonCode?: NextOptionReasonCode;
  reason?: string;
}

/** Output payload for next-options endpoint. */
export interface ListNextOptionsOutput {
  columnIndex: number;
  options: NextOptionDto[];
  lookAhead: { feasible: boolean };
  version: number;
}

/** Maps a domain aggregate into the API DTO shape. */
export function toConfigurationDto(configuration: Configuration): ConfigurationDto {
  return {
    id: configuration.id,
    ownerId: configuration.ownerId,
    collaborators: configuration.collaborators,
    name: configuration.name,
    status: configuration.status,
    category: configuration.category,
    environment: configuration.environment,
    columnPlan: configuration.columnPlan,
    columnDesigns: configuration.columnDesigns,
    version: configuration.version,
    createdAt: configuration.createdAt,
    updatedAt: configuration.updatedAt,
    bom: configuration.components,
  };
}
