/**
 * catalogService entry point.
 * Reads PORT, MONGO_URI, and REDIS_URL from environment,
 * connects to MongoDB, and starts the server.
 */
import mongoose from 'mongoose';
import { buildApp } from './app';
import { logger } from './infrastructure/logger';

const PORT      = Number(process.env['CATALOG_PORT'] ?? process.env['PORT']) || 3004;
const MONGO_URI = process.env['CATALOG_MONGO_URI'] ?? process.env['MONGO_URI'] ?? 'mongodb://localhost:27017/kompozer-catalog';
const REDIS_URL = process.env['REDIS_URL'] || '';

const app = buildApp({ redisUrl: REDIS_URL || undefined });

mongoose
  .connect(MONGO_URI)
  .then(() => {
    logger.info({ event: 'catalog.startup.db_connected' }, 'MongoDB connected');
    app.listen(PORT, () => {
      logger.info({ event: 'catalog.startup.listening', port: PORT }, `Listening on port ${PORT}`);
    });
  })
  .catch((err: unknown) => {
    logger.fatal({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  });
