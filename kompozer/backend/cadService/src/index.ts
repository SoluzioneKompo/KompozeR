import mongoose from 'mongoose';
import { createServer } from 'http';
import { buildApp } from './app';
import { CollabSocketHub } from './adapters/websocket/CollabSocketHub';
import { MongoCollabCheckpointStore } from './adapters/persistence/MongoCollabCheckpointStore';
import { MongoCollabEventLog } from './adapters/persistence/MongoCollabEventLog';
import { MongoConfigurationRepository } from './adapters/persistence/MongoConfigurationRepository';
import { InMemoryCollabSessionService } from './domain/services/InMemoryCollabSessionService';

/** HTTP listening port for the CAD service. */
const PORT = Number(process.env['CAD_PORT'] ?? process.env['PORT']) || 3002;
/** Mongo connection string for CAD persistence. */
const MONGO_URI = process.env['CAD_MONGO_URI'] ?? process.env['MONGO_URI'] ?? 'mongodb://localhost:27017/kompozer-cad';
/** Interval (ms) between periodic collaborative-state checkpoints. */
const CHECKPOINT_INTERVAL_MS = Number(process.env['CAD_CHECKPOINT_INTERVAL_MS']) || 10000;

/**
 * Builds Mongo connection options from env, making the consistency/availability
 * trade-off explicit and configurable (replica set read/write concern).
 */
function buildConnectOptions(): mongoose.ConnectOptions {
  const options: mongoose.ConnectOptions = {};

  const writeConcern = process.env['CAD_WRITE_CONCERN'];
  if (writeConcern) {
    options.w = (/^\d+$/.test(writeConcern) ? Number(writeConcern) : writeConcern) as mongoose.ConnectOptions['w'];
  }

  const readConcern = process.env['CAD_READ_CONCERN'];
  if (readConcern) {
    options.readConcernLevel = readConcern as mongoose.ConnectOptions['readConcernLevel'];
  }

  const readPreference = process.env['CAD_READ_PREFERENCE'];
  if (readPreference) {
    options.readPreference = readPreference as mongoose.ConnectOptions['readPreference'];
  }

  return options;
}

const checkpointStore = new MongoCollabCheckpointStore();
const eventLog = new MongoCollabEventLog();
const collabSessionService = new InMemoryCollabSessionService(
  new MongoConfigurationRepository(),
  undefined,
  undefined,
  checkpointStore,
  eventLog,
);
const app = buildApp({ collabSessionService });
const server = createServer(app);

const socketHub = new CollabSocketHub(server, collabSessionService);

mongoose
  .connect(MONGO_URI, buildConnectOptions())
  .then(async () => {
    console.log(`[cad] MongoDB connected: ${MONGO_URI}`);

    const recovered = await collabSessionService.recoverSessions();
    if (recovered.length > 0) {
      console.log(`[cad] Recovered ${recovered.length} collaborative session(s): ${recovered.join(', ')}`);
      for (const sessionCode of recovered) {
        socketHub.broadcastResync(sessionCode);
      }
    }

    const checkpointTimer = setInterval(() => {
      collabSessionService
        .checkpointAllSessions()
        .catch((err: unknown) => console.error('[cad] Checkpoint failed', err));
    }, CHECKPOINT_INTERVAL_MS);
    checkpointTimer.unref();

    server.listen(PORT, () => {
      console.log(`[cad] Listening on port ${PORT}`);
    });
  })
  .catch((err: unknown) => {
    console.error('[cad] Failed to connect to MongoDB', err);
    process.exit(1);
  });
