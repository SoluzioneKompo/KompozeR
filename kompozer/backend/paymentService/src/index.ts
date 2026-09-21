/**
 * paymentService entrypoint.
 * Reads runtime configuration, connects to MongoDB,
 * and starts the HTTP server.
 */
import mongoose from 'mongoose';
import { buildApp } from './app';
import { logger } from './infrastructure/logger';

const PORT = Number(process.env['PAYMENT_PORT'] ?? process.env['PORT']) || 3009;
const MONGO_URI =
  process.env['PAYMENT_MONGO_URI'] ??
  process.env['MONGO_URI'] ??
  'mongodb://localhost:27017/kompozer-payment';

const app = buildApp({ redisUrl: process.env['REDIS_URL'] });

mongoose
  .connect(MONGO_URI)
  .then(() => {
    logger.info({ event: 'payment.startup.db_connected' }, 'MongoDB connected');
    app.listen(PORT, () => {
      logger.info({ event: 'payment.startup.listening', port: PORT }, 'Listening');
    });
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  });
