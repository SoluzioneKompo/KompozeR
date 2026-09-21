import mongoose from 'mongoose';
import { buildApp } from './app';
import { logger } from './infrastructure/logger';

/** HTTP port used by the reporting service. */
const PORT = Number(process.env['REPORTING_PORT'] ?? process.env['PORT']) || 3007;
/** MongoDB connection string used by the reporting service. */
const MONGO_URI =
  process.env['REPORTING_MONGO_URI'] ??
  process.env['ORDER_MONGO_URI'] ??
  process.env['MONGO_URI'] ??
  'mongodb://localhost:27017/kompozer-order';

const app = buildApp();

mongoose
  .connect(MONGO_URI)
  .then(() => {
    logger.info({ event: 'reporting.startup.mongo_connected' }, 'MongoDB connected');
    app.listen(PORT, () => {
      logger.info({ event: 'reporting.startup.listening', port: PORT }, 'Reporting service listening');
    });
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  });
