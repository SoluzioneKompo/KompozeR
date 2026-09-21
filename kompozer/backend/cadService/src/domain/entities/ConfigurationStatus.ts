export const CONFIGURATION_STATUSES = [
  'DRAFT',
  'CATEGORY_SELECTED',
  'COLUMNS_DEFINED',
  'DESIGN_IN_PROGRESS',
  'READY_FOR_FINALIZE',
  'FINALIZED',
] as const;

/** Lifecycle states for CAD configuration workflow steps. */
export type ConfigurationStatus = (typeof CONFIGURATION_STATUSES)[number];
