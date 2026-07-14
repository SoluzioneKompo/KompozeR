import { Schema, model } from 'mongoose';

/** Embedded per-field Lamport clock. */
export type CollabFieldClockDoc = {
  fieldPath: string;
  lamport: number;
  actorId: string;
};

/** Persisted checkpoint document. `_id` is the session code. */
export type CollabCheckpointDoc = {
  _id: string;
  configurationId: string;
  hostUserId: string;
  participants: string[];
  snapshot: unknown;
  lamport: number;
  expiresAtMs: number;
  appliedOpIds: string[];
  fieldClocks: CollabFieldClockDoc[];
  lastEventSeq: number;
  checkpointedAt: Date;
};

const fieldClockSchema = new Schema<CollabFieldClockDoc>(
  {
    fieldPath: { type: String, required: true },
    lamport: { type: Number, required: true },
    actorId: { type: String, required: true },
  },
  { _id: false },
);

/** Root schema for the collaborative session checkpoints collection. */
const collabCheckpointSchema = new Schema<CollabCheckpointDoc>(
  {
    _id: { type: String, required: true },
    configurationId: { type: String, required: true },
    hostUserId: { type: String, required: true },
    participants: { type: [String], default: [] },
    snapshot: { type: Schema.Types.Mixed, required: true },
    lamport: { type: Number, required: true },
    expiresAtMs: { type: Number, required: true },
    appliedOpIds: { type: [String], default: [] },
    fieldClocks: { type: [fieldClockSchema], default: [] },
    lastEventSeq: { type: Number, default: 0 },
    checkpointedAt: { type: Date, required: true },
  },
  { collection: 'collab_checkpoints', versionKey: false },
);

export const CollabCheckpointModel = model<CollabCheckpointDoc>(
  'CollabCheckpoint',
  collabCheckpointSchema,
);
