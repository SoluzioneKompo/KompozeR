import { Schema, model } from 'mongoose';

/** Persisted collaborative event document. */
export type CollabEventDoc = {
  seq: number;
  sessionCode: string;
  opId: string;
  actorId: string;
  lamport: number;
  fieldPath: string;
  value: unknown;
  resultingVersion: number;
  appliedAt: Date;
};

const collabEventSchema = new Schema<CollabEventDoc>(
  {
    seq: { type: Number, required: true },
    sessionCode: { type: String, required: true },
    opId: { type: String, required: true },
    actorId: { type: String, required: true },
    lamport: { type: Number, required: true },
    fieldPath: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    resultingVersion: { type: Number, required: true },
    appliedAt: { type: Date, required: true },
  },
  { collection: 'collab_events', versionKey: false },
);

collabEventSchema.index({ sessionCode: 1, seq: 1 }, { unique: true });

export const CollabEventModel = model<CollabEventDoc>('CollabEvent', collabEventSchema);

/** Monotonic per-session sequence counter document. `_id` is the session code. */
export type CollabEventCounterDoc = {
  _id: string;
  seq: number;
};

const collabEventCounterSchema = new Schema<CollabEventCounterDoc>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'collab_event_counters', versionKey: false },
);

export const CollabEventCounterModel = model<CollabEventCounterDoc>(
  'CollabEventCounter',
  collabEventCounterSchema,
);
