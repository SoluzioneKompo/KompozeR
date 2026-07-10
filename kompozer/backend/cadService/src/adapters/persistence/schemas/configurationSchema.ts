import { Schema, model } from 'mongoose';
import { CATEGORIES, Category } from '../../../domain/entities/Category';
import { ConfigurationStatus } from '../../../domain/entities/ConfigurationStatus';
import { CatalogComponentType } from '../../../domain/ports/CatalogRulesProvider';

type EnvironmentDoc = {
  maxWidthMm: number;
  maxHeightMm: number;
  minWidthMm: number;
  minHeightMm: number;
  unit: 'mm';
};

type ColumnPlanItemDoc = {
  index: number;
  shelfWidthMm: number;
};

type ColumnPlanDoc = {
  columnCount: number;
  columns: ColumnPlanItemDoc[];
};

type ColumnDesignDoc = {
  columnIndex: number;
  levelsMm: number[];
  shelfThicknessMm: number;
};

type BomItemDoc = {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  componentType: CatalogComponentType;
};

export type ConfigurationDoc = {
  _id: string;
  ownerId: string;
  collaborators: string[];
  name: string;
  status: ConfigurationStatus;
  category: Category | null;
  environment: EnvironmentDoc | null;
  columnPlan: ColumnPlanDoc | null;
  columnDesigns: ColumnDesignDoc[];
  components: BomItemDoc[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Embedded schema for environment constraints. */
const environmentSchema = new Schema<EnvironmentDoc>(
  {
    maxWidthMm: { type: Number, required: true },
    maxHeightMm: { type: Number, required: true },
    minWidthMm: { type: Number, required: true },
    minHeightMm: { type: Number, required: true },
    unit: { type: String, enum: ['mm'], required: true },
  },
  { _id: false },
);

/** Embedded schema for a single planned column. */
const columnPlanItemSchema = new Schema<ColumnPlanItemDoc>(
  {
    index: { type: Number, required: true },
    shelfWidthMm: { type: Number, required: true },
  },
  { _id: false },
);

/** Embedded schema for overall column plan. */
const columnPlanSchema = new Schema<ColumnPlanDoc>(
  {
    columnCount: { type: Number, required: true },
    columns: { type: [columnPlanItemSchema], required: true },
  },
  { _id: false },
);

/** Embedded schema for per-column design levels. */
const columnDesignSchema = new Schema<ColumnDesignDoc>(
  {
    columnIndex: { type: Number, required: true },
    levelsMm: { type: [Number], default: [] },
    shelfThicknessMm: { type: Number, required: true },
  },
  { _id: false },
);

/** Embedded schema for persisted BOM line items. */
const bomItemSchema = new Schema<BomItemDoc>(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPriceCents: { type: Number, required: true },
    componentType: { type: String, required: true },
  },
  { _id: false },
);

/** Root schema for CAD configurations collection. */
const configurationSchema = new Schema<ConfigurationDoc>(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    collaborators: { type: [String], default: [] },
    name: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: [
        'DRAFT',
        'ENVIRONMENT_DEFINED',
        'CATEGORY_SELECTED',
        'COLUMNS_DEFINED',
        'DESIGN_IN_PROGRESS',
        'READY_FOR_FINALIZE',
        'FINALIZED',
      ],
    },
    category: {
      type: String,
      enum: CATEGORIES,
      required: false,
      default: null,
    },
    environment: {
      type: environmentSchema,
      required: false,
      default: null,
    },
    columnPlan: {
      type: columnPlanSchema,
      required: false,
      default: null,
    },
    columnDesigns: {
      type: [columnDesignSchema],
      default: [],
    },
    components: {
      type: [bomItemSchema],
      default: [],
    },
    version: { type: Number, required: true, default: 1 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    _id: false,
  },
);

configurationSchema.index({ ownerId: 1, updatedAt: -1 });
configurationSchema.index({ collaborators: 1, updatedAt: -1 });

export const ConfigurationModel = model<ConfigurationDoc>(
  'Configuration',
  configurationSchema,
  'configurations',
);
