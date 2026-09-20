/** CAD domain contracts for configurations, components, and lifecycle statuses. */
export type ConfigurationStatus =
  | 'DRAFT'
  | 'CATEGORY_SELECTED'
  | 'COLUMNS_DEFINED'
  | 'DESIGN_IN_PROGRESS'
  | 'READY_FOR_FINALIZE'
  | 'FINALIZED';

export type Category = 'TONDO' | 'QUADRO' | 'KUBE';

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

/** User-chosen terminal (cap) height for one spine (0..columnCount, inclusive). */
export interface TerminalSelection {
  spineIndex: number;
  heightMm: number;
}

export interface BomItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  unitPriceCents?: number;
  componentType?:
    | 'RIPIANO'
    | 'PIEDINO'
    | 'MONTANTE'
    | 'TERMINALE'
    | 'MENSOLA'
    | 'RIPIANO_BORDO'
    | 'RIPIANO_INTERMEDIO';
}

export interface ConfigurationDto {
  id: string;
  ownerId: string;
  collaborators?: string[];
  name: string;
  status: ConfigurationStatus;
  category: Category | null;
  depthMm: number | null;
  columnPlan: ColumnPlan | null;
  columnDesigns: ColumnDesign[];
  terminalSelections: TerminalSelection[];
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
  | 'SPINE_CONFLICT'
  | 'INTELLIGENTE_CATALOG_MISSING';

export interface NextOption {
  heightMm: number;
  allowed: boolean;
  kind?: 'standard' | 'bridge' | 'stacked';
  reasonCode?: NextOptionReasonCode;
  reason?: string;
}

export interface NextOptionsDto {
  columnIndex: number;
  options: NextOption[];
  lookAhead: { feasible: boolean };
  version: number;
}
