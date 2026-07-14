import {
  CollabEvent,
  CollabEventInput,
  CollabEventLog,
} from '../../domain/ports/CollabEventLog';
import {
  CollabEventCounterModel,
  CollabEventDoc,
  CollabEventModel,
} from './schemas/collabEventSchema';

/** MongoDB-backed append-only log of applied collaborative operations. */
export class MongoCollabEventLog implements CollabEventLog {
  async append(event: CollabEventInput): Promise<number> {
    const counter = await CollabEventCounterModel.findByIdAndUpdate(
      event.sessionCode,
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    ).lean<{ _id: string; seq: number }>();

    const seq = counter?.seq ?? 1;

    await CollabEventModel.create({
      seq,
      sessionCode: event.sessionCode,
      opId: event.opId,
      actorId: event.actorId,
      lamport: event.lamport,
      fieldPath: event.fieldPath,
      value: event.value,
      resultingVersion: event.resultingVersion,
      appliedAt: new Date(),
    });

    return seq;
  }

  async readSince(sessionCode: string, afterSeq: number): Promise<CollabEvent[]> {
    const docs = await CollabEventModel.find({ sessionCode, seq: { $gt: afterSeq } })
      .sort({ seq: 1 })
      .lean<CollabEventDoc[]>();

    return docs.map((doc) => ({
      seq: doc.seq,
      sessionCode: doc.sessionCode,
      opId: doc.opId,
      actorId: doc.actorId,
      lamport: doc.lamport,
      fieldPath: doc.fieldPath,
      value: doc.value,
      resultingVersion: doc.resultingVersion,
      appliedAt: new Date(doc.appliedAt),
    }));
  }

  async truncateUpTo(sessionCode: string, seq: number): Promise<void> {
    await CollabEventModel.deleteMany({ sessionCode, seq: { $lte: seq } });
  }

  async deleteForSession(sessionCode: string): Promise<void> {
    await CollabEventModel.deleteMany({ sessionCode });
    await CollabEventCounterModel.deleteOne({ _id: sessionCode });
  }
}
