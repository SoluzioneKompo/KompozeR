/** Applied operation to be appended to the collaborative event log. */
export interface CollabEventInput {
  sessionCode: string;
  opId: string;
  actorId: string;
  lamport: number;
  fieldPath: string;
  value: unknown;
  resultingVersion: number;
}

/** A logged event, enriched with its monotonic per-session sequence number. */
export interface CollabEvent extends CollabEventInput {
  seq: number;
  appliedAt: Date;
}

/**
 * Append-only log of applied collaborative operations (stable storage).
 *
 * Events logged after the latest checkpoint are replayed during recovery so the
 * reconstructed session state matches the pre-crash state.
 */
export interface CollabEventLog {
  /** Appends an applied operation and returns its assigned sequence number. */
  append(event: CollabEventInput): Promise<number>;
  /** Returns, in sequence order, the events logged after {@link afterSeq}. */
  readSince(sessionCode: string, afterSeq: number): Promise<CollabEvent[]>;
  /** Drops events already folded into a checkpoint (seq <= given value). */
  truncateUpTo(sessionCode: string, seq: number): Promise<void>;
  /** Removes every event of a session that is no longer active. */
  deleteForSession(sessionCode: string): Promise<void>;
}
