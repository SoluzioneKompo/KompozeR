import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { buildApp } from './app';

/** HTTP port used by the chatbot service. */
const PORT = Number(process.env['CHATBOT_PORT'] ?? process.env['PORT']) || 3006;
/** MongoDB connection string for chatbot persistence. */
const MONGO_URI =
  process.env['CHAT_MONGO_URI'] ??
  process.env['MONGO_URI'] ??
  'mongodb://localhost:27017/kompozer-chatbot';
/** Base URL for catalog lookup requests. */
const CATALOG_BASE_URL = process.env['CATALOG_BASE_URL'] ?? 'http://catalog-service:3002';
/** Base URL for CAD configuration lookups. */
const CAD_BASE_URL = process.env['CAD_SERVICE_URL'] ?? 'http://cad-service:3003';
/** Mistral LLM credentials/configuration (optional: falls back to template answers). */
const MISTRAL_API_KEY = process.env['MISTRAL_API_KEY'];
const MISTRAL_MODEL = process.env['MISTRAL_MODEL'];
const MISTRAL_BASE_URL = process.env['MISTRAL_BASE_URL'];

const { app, deps } = buildApp({
  catalogBaseUrl: CATALOG_BASE_URL,
  cadBaseUrl: CAD_BASE_URL,
  mistralApiKey: MISTRAL_API_KEY,
  mistralModel: MISTRAL_MODEL,
  mistralBaseUrl: MISTRAL_BASE_URL,
});

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  path: '/chatbot/socket.io',
  cors: {
    origin: true,
    credentials: true,
  },
  /** Keep polling enabled so gateway proxying remains simple. */
  // Polling works through API Gateway HTTP proxy without special upgrade wiring.
  transports: ['polling', 'websocket'],
});

io.on('connection', (socket) => {
  const userIdHeader = socket.handshake.headers['x-user-id'];
  const userId = typeof userIdHeader === 'string' ? userIdHeader : '';

  if (!userId) {
    socket.emit('chat:error', { message: 'Missing identity header X-User-Id' });
    socket.disconnect(true);
    return;
  }

  socket.on(
    'chat:message:send',
    async (
      payload: { sessionId?: string; content?: string },
      ack?: (response: { ok: boolean; output?: unknown; error?: string }) => void,
    ) => {
      const sessionId = payload.sessionId ?? '';
      try {
        socket.emit('chat:typing', { sessionId, active: true });

        const output = await deps.sendSessionMessage.execute({
          userId,
          sessionId,
          content: payload.content ?? '',
        });

        socket.emit('chat:message:new', output.userMessage);
        socket.emit('chat:message:new', output.botMessage);
        ack?.({ ok: true, output });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to send chat message';
        socket.emit('chat:error', { message });
        ack?.({ ok: false, error: message });
      } finally {
        socket.emit('chat:typing', { sessionId, active: false });
      }
    },
  );
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(`[chatbot] MongoDB connected: ${MONGO_URI}`);
    httpServer.listen(PORT, () => {
      console.log(`[chatbot] Listening on port ${PORT}`);
    });
  })
  .catch((err: unknown) => {
    console.error('[chatbot] Failed to connect to MongoDB', err);
    process.exit(1);
  });
