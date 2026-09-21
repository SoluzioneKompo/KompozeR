/**
 * Authentication Service process entry point.
 *
 * Reads environment variables (PORT, MONGO_URI, JWT_SECRET, SESSION_TTL_HOURS),
 * connects to MongoDB, and starts the HTTP server.
 *
 * The process exits early if JWT_SECRET is missing or if database connection fails.
 */
import mongoose from 'mongoose';
import { buildApp } from './app';
import { logger } from './infrastructure/logger';

const PORT = Number(process.env['AUTH_PORT'] ?? process.env['PORT']) || 3001;
const MONGO_URI = process.env['AUTH_MONGO_URI'] ?? process.env['MONGO_URI'] ?? 'mongodb://localhost:27017/kompozer-auth';
const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 8;

if (!JWT_SECRET) {
  logger.fatal('JWT_SECRET environment variable is not set');
  process.exit(1);
}

const app = buildApp({
  jwtSecret: JWT_SECRET,
  sessionTtlMs: SESSION_TTL_HOURS * 60 * 60 * 1000,
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    logger.info({ event: 'auth.startup.db_connected' }, 'MongoDB connected');
    app.listen(PORT, () => {
      logger.info({ event: 'auth.startup.listening', port: PORT }, `Listening on port ${PORT}`);
    });
  })
  .catch((err: unknown) => {
    logger.fatal({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  });
