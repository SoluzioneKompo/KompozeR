/** CAD domain contracts for configurations, components, and lifecycle statuses. */
export type ConfigurationStatus =
  | 'DRAFT'
  | 'ENVIRONMENT_DEFINED'
  | 'CATEGORY_SELECTED'
  | 'COLUMNS_DEFINED'
  | 'DESIGN_IN_PROGRESS'
  | 'READY_FOR_FINALIZE'
  | 'FINALIZED';

export type Category = 'TONDO' | 'QUADRO' | 'KUBE' | 'INTELLIGENTE';

export interface Environment {
  maxWidthMm: number;
  maxHeightMm: number;
  minWidthMm: number;
  minHeightMm: number;
  unit: 'mm';
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

export interface BomItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  unitPriceCents?: number;
  componentType?: 'RIPIANO' | 'PIEDINO' | 'MONTANTE' | 'TERMINALE';
}

export interface ConfigurationDto {
  id: string;
  ownerId: string;
  name: string;
  status: ConfigurationStatus;
  category: Category | null;
  environment: Environment | null;
  columnPlan: ColumnPlan | null;
  columnDesigns: ColumnDesign[];
  version: number;
  bom?: BomItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ConfigurationsListDto {
  items: ConfigurationDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type NextOptionReasonCode =
  | 'INVALID_GAP'
  | 'NON_INCREASING_LEVEL'
  | 'MAX_HEIGHT_EXCEEDED'
  | 'ADJACENCY_CONFLICT'
  | 'LOOK_AHEAD_BLOCKED'
  | 'INVALID_FIRST_LEVEL'
  | 'INVALID_SEGMENT'
  | 'NO_TERMINAL_FIT'
  | 'SPINE_CONFLICT';

export interface NextOption {
  heightMm: number;
  allowed: boolean;
  kind?: 'standard' | 'bridge';
  reasonCode?: NextOptionReasonCode;
  reason?: string;
}

export interface NextOptionsDto {
  columnIndex: number;
  options: NextOption[];
  lookAhead: { feasible: boolean };
  version: number;
}
