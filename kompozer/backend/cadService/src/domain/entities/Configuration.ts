import { Category } from './Category';
import { ConfigurationStatus } from './ConfigurationStatus';
import { ValidationError } from './errors';
import { BomItem } from './Bom';

export type Unit = 'mm';

export interface Environment {
  maxWidthMm: number;
  maxHeightMm: number;
  minWidthMm: number;
  minHeightMm: number;
  unit: Unit;
}

export interface ColumnPlanItem {
  index: number;
  shelfWidthMm: number;
}

export interface ColumnPlan {
  columnCount: number;
  columns: ColumnPlanItem[];
}

export interface ColumnDesign {
  columnIndex: number;
  levelsMm: number[];
  shelfThicknessMm: number;
}

export interface Configuration {
  id: string;
  ownerId: string;
  collaborators: string[];
  name: string;
  status: ConfigurationStatus;
  category: Category | null;
  environment: Environment | null;
  columnPlan: ColumnPlan | null;
  columnDesigns: ColumnDesign[];
  components: BomItem[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Validates the aggregate invariants enforced at domain level.
 */
export function validateConfigurationModel(configuration: Configuration): void {
  if (!configuration.id.trim()) {
    throw new ValidationError('Configuration id is required');
  }

  if (!configuration.ownerId.trim()) {
    throw new ValidationError('Owner id is required');
  }

  const cleanedCollaborators = configuration.collaborators
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== configuration.ownerId);
  configuration.collaborators = Array.from(new Set(cleanedCollaborators));

  if (configuration.version < 1) {
    throw new ValidationError('Version must be >= 1');
  }

  if (configuration.columnPlan) {
    const { columnCount, columns } = configuration.columnPlan;
    if (columnCount !== columns.length) {
      throw new ValidationError('columnPlan.columnCount must match columns length');
    }

    const seen = new Set<number>();
    for (const column of columns) {
      if (seen.has(column.index)) {
        throw new ValidationError('columnPlan columns must have unique indices');
      }
      seen.add(column.index);

      if (column.shelfWidthMm <= 0) {
        throw new ValidationError('columnPlan shelfWidthMm must be > 0');
      }
    }
  }

  for (const design of configuration.columnDesigns) {
    if (design.shelfThicknessMm <= 0) {
      throw new ValidationError('columnDesign shelfThicknessMm must be > 0');
    }

    for (let i = 1; i < design.levelsMm.length; i += 1) {
      if (design.levelsMm[i] <= design.levelsMm[i - 1]) {
        throw new ValidationError('columnDesign levelsMm must be strictly increasing');
      }
    }
  }
}
