/**
 * orderService entrypoint.
 * Reads runtime configuration, connects to MongoDB,
 * and starts the HTTP server.
 */
import mongoose from 'mongoose';
import { buildApp } from './app';
import { logger } from './infrastructure/logger';

const PORT = Number(process.env['ORDER_PORT'] ?? process.env['PORT']) || 3008;
const MONGO_URI =
  process.env['ORDER_MONGO_URI'] ??
  process.env['MONGO_URI'] ??
  'mongodb://localhost:27017/kompozer-order';

const app = buildApp({ redisUrl: process.env['REDIS_URL'] });

mongoose
  .connect(MONGO_URI)
  .then(() => {
    logger.info({ event: 'order.startup.db_connected' }, 'MongoDB connected');
    app.listen(PORT, () => {
      logger.info({ event: 'order.startup.listening', port: PORT }, `Listening on port ${PORT}`);
    });
  })
  .catch((err: unknown) => {
    logger.fatal({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  });
