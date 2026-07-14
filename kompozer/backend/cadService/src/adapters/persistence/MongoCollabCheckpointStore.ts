import { Configuration } from '../../domain/entities/Configuration';
import {
  CollabCheckpoint,
  CollabCheckpointStore,
} from '../../domain/ports/CollabCheckpointStore';
import {
  CollabCheckpointDoc,
  CollabCheckpointModel,
} from './schemas/collabCheckpointSchema';

/** MongoDB-backed stable storage for collaborative session checkpoints. */
export class MongoCollabCheckpointStore implements CollabCheckpointStore {
  async saveCheckpoint(checkpoint: CollabCheckpoint): Promise<void> {
    await CollabCheckpointModel.findByIdAndUpdate(
      checkpoint.sessionCode,
      {
        _id: checkpoint.sessionCode,
        configurationId: checkpoint.configurationId,
        hostUserId: checkpoint.hostUserId,
        participants: checkpoint.participants,
        snapshot: checkpoint.snapshot,
        lamport: checkpoint.lamport,
        expiresAtMs: checkpoint.expiresAtMs,
        appliedOpIds: checkpoint.appliedOpIds,
        fieldClocks: checkpoint.fieldClocks,
        lastEventSeq: checkpoint.lastEventSeq,
        checkpointedAt: checkpoint.checkpointedAt,
      },
      { upsert: true },
    );
  }

  async loadAllCheckpoints(): Promise<CollabCheckpoint[]> {
    const docs = await CollabCheckpointModel.find().lean<CollabCheckpointDoc[]>();
    return docs.map((doc) => this.toCheckpoint(doc));
  }

  async deleteCheckpoint(sessionCode: string): Promise<void> {
    await CollabCheckpointModel.deleteOne({ _id: sessionCode });
  }

  private toCheckpoint(doc: CollabCheckpointDoc): CollabCheckpoint {
    const snapshot = doc.snapshot as Configuration;
    return {
      sessionCode: doc._id,
      configurationId: doc.configurationId,
      hostUserId: doc.hostUserId,
      participants: doc.participants ?? [],
      snapshot: {
        ...snapshot,
        createdAt: new Date(snapshot.createdAt),
        updatedAt: new Date(snapshot.updatedAt),
      },
      lamport: doc.lamport,
      expiresAtMs: doc.expiresAtMs,
      appliedOpIds: doc.appliedOpIds ?? [],
      fieldClocks: (doc.fieldClocks ?? []).map((clock) => ({
        fieldPath: clock.fieldPath,
        lamport: clock.lamport,
        actorId: clock.actorId,
      })),
      lastEventSeq: doc.lastEventSeq ?? 0,
      checkpointedAt: new Date(doc.checkpointedAt),
    };
  }
}
