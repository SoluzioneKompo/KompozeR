/**
 * paymentService entrypoint.
 * Reads runtime configuration, connects to MongoDB,
 * and starts the HTTP server.
 */
import mongoose from 'mongoose';
import { buildApp } from './app';

const PORT = Number(process.env['PAYMENT_PORT'] ?? process.env['PORT']) || 3009;
const MONGO_URI =
  process.env['PAYMENT_MONGO_URI'] ??
  process.env['MONGO_URI'] ??
  'mongodb://localhost:27017/kompozer-payment';

const app = buildApp();

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(`[payment] MongoDB connected: ${MONGO_URI}`);
    app.listen(PORT, () => {
      console.log(`[payment] Listening on port ${PORT}`);
    });
  })
  .catch((err: unknown) => {
    console.error('[payment] Failed to connect to MongoDB', err);
    process.exit(1);
  });
