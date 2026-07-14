import { Configuration } from '../entities/Configuration';

/** Per-field Lamport clock captured in a checkpoint. */
export interface CollabFieldClockEntry {
  fieldPath: string;
  lamport: number;
  actorId: string;
}

/**
 * Durable snapshot of a collaborative session state (stable storage).
 *
 * Together with the events logged after {@link lastEventSeq}, a checkpoint lets
 * the service reconstruct an active session after a crash.
 */
export interface CollabCheckpoint {
  sessionCode: string;
  configurationId: string;
  hostUserId: string;
  participants: string[];
  snapshot: Configuration;
  lamport: number;
  expiresAtMs: number;
  appliedOpIds: string[];
  fieldClocks: CollabFieldClockEntry[];
  lastEventSeq: number;
  checkpointedAt: Date;
}

/** Stable-storage contract for collaborative session checkpoints. */
export interface CollabCheckpointStore {
  /** Persists (or replaces) the checkpoint for a session. */
  saveCheckpoint(checkpoint: CollabCheckpoint): Promise<void>;
  /** Loads every persisted checkpoint (used on recovery). */
  loadAllCheckpoints(): Promise<CollabCheckpoint[]>;
  /** Removes the checkpoint of a session that is no longer active. */
  deleteCheckpoint(sessionCode: string): Promise<void>;
}
