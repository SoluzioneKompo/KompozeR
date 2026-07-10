import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { CadError } from '../../domain/entities/errors';
import {
  CollabFieldPath,
  InMemoryCollabSessionService,
} from '../../domain/services/InMemoryCollabSessionService';

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

type JoinPayload = {
  requestId?: string;
  data?: {
    configurationId?: string;
    sessionId?: string;
  };
};

type LeavePayload = {
  requestId?: string;
  data?: {
    configurationId?: string;
    sessionId?: string;
  };
};

type SnapshotPayload = {
  requestId?: string;
  data?: {
    configurationId?: string;
    sessionId?: string;
  };
};

type ApplyOperationPayload = {
  requestId?: string;
  data?: {
    configurationId?: string;
    sessionId?: string;
    opId?: string;
    lamport?: number;
    fieldPath?: CollabFieldPath;
    value?: unknown;
    baseVersion?: number;
  };
};

function roomOf(sessionId: string): string {
  return `cad:collab:${sessionId}`;
}

function readUserId(socket: Socket): string {
  const header = socket.handshake.headers['x-user-id'];
  if (typeof header !== 'string' || !header.trim()) {
    throw new Error('Missing identity header X-User-Id');
  }
  return header;
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof CadError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: error.message || 'Unexpected error' };
  }

  return { code: 'INTERNAL_ERROR', message: 'Unexpected error' };
}

/**
 * Socket.IO hub for collaborative CAD editing.
 *
 * Transport path is aligned with gateway proxy: /cad/collab/socket.io
 */
export class CollabSocketHub {
  private readonly io: Server;

  constructor(
    server: HttpServer,
    private readonly collabSessionService: InMemoryCollabSessionService,
  ) {
    this.io = new Server(server, {
      path: '/cad/collab/socket.io',
      cors: {
        origin: '*',
      },
      transports: ['polling', 'websocket'],
    });

    this.io.on('connection', (socket) => {
      let userId = '';
      try {
        userId = readUserId(socket);
      } catch (error) {
        const mapped = normalizeError(error);
        socket.emit('cad:collab:error', { error: mapped });
        socket.disconnect(true);
        return;
      }

      const joinedSessions = new Map<string, string>();

      socket.on('cad:collab:join', async (payload: JoinPayload, ack?: (response: AckResponse<unknown>) => void) => {
        const configurationId = payload?.data?.configurationId?.trim() || '';
        const providedSessionId = payload?.data?.sessionId?.trim() || '';

        if (!configurationId && !providedSessionId) {
          const error = { code: 'VALIDATION_ERROR', message: 'configurationId or sessionId is required' };
          ack?.({ ok: false, error });
          return;
        }

        try {
          const output = providedSessionId
            ? (configurationId
              ? await this.collabSessionService.joinSession({
                  sessionId: providedSessionId,
                  configurationId,
                  userId,
                })
              : await this.collabSessionService.joinSessionById({
                  sessionId: providedSessionId,
                  userId,
                }))
            : await this.collabSessionService.createSession({
                configurationId,
                hostUserId: userId,
              });

          socket.join(roomOf(output.sessionId));
          joinedSessions.set(output.sessionId, output.configurationId);

          socket.emit('cad:collab:joined', {
            requestId: payload?.requestId,
            data: output,
          });

          socket.to(roomOf(output.sessionId)).emit('cad:collab:presence', {
            event: 'joined',
            userId,
            sessionId: output.sessionId,
            participants: output.participants,
          });

          ack?.({ ok: true, data: output });
        } catch (error) {
          const mapped = normalizeError(error);
          socket.emit('cad:collab:error', { requestId: payload?.requestId, error: mapped });
          ack?.({ ok: false, error: mapped });
        }
      });

      socket.on('cad:collab:leave', async (payload: LeavePayload, ack?: (response: AckResponse<unknown>) => void) => {
        const configurationId = payload?.data?.configurationId?.trim() || '';
        const sessionId = payload?.data?.sessionId?.trim() || '';

        if (!configurationId || !sessionId) {
          const error = {
            code: 'VALIDATION_ERROR',
            message: 'configurationId and sessionId are required',
          };
          ack?.({ ok: false, error });
          return;
        }

        try {
          await this.collabSessionService.leaveSession({
            sessionId,
            configurationId,
            userId,
          });

          socket.leave(roomOf(sessionId));
          joinedSessions.delete(sessionId);

          socket.to(roomOf(sessionId)).emit('cad:collab:presence', {
            event: 'left',
            userId,
            sessionId,
          });

          ack?.({ ok: true, data: { sessionId, left: true } });
        } catch (error) {
          const mapped = normalizeError(error);
          socket.emit('cad:collab:error', { requestId: payload?.requestId, error: mapped });
          ack?.({ ok: false, error: mapped });
        }
      });

      socket.on('cad:collab:snapshot', async (
        payload: SnapshotPayload,
        ack?: (response: AckResponse<unknown>) => void,
      ) => {
        const configurationId = payload?.data?.configurationId?.trim() || '';
        const sessionId = payload?.data?.sessionId?.trim() || '';

        if (!configurationId || !sessionId) {
          const error = {
            code: 'VALIDATION_ERROR',
            message: 'configurationId and sessionId are required',
          };
          ack?.({ ok: false, error });
          return;
        }

        try {
          const output = await this.collabSessionService.getSnapshot({
            sessionId,
            configurationId,
            userId,
          });
          socket.join(roomOf(output.sessionId));
          joinedSessions.set(output.sessionId, output.configurationId);
          ack?.({ ok: true, data: output });
        } catch (error) {
          const mapped = normalizeError(error);
          socket.emit('cad:collab:error', { requestId: payload?.requestId, error: mapped });
          ack?.({ ok: false, error: mapped });
        }
      });

      socket.on('cad:collab:operation', async (
        payload: ApplyOperationPayload,
        ack?: (response: AckResponse<unknown>) => void,
      ) => {
        const data = payload?.data;
        const configurationId = data?.configurationId?.trim() || '';
        const sessionId = data?.sessionId?.trim() || '';
        const opId = data?.opId?.trim() || '';
        const fieldPath = data?.fieldPath;
        const lamport = Number(data?.lamport);
        const baseVersion = Number(data?.baseVersion);

        if (!configurationId || !sessionId || !opId || !fieldPath || Number.isNaN(lamport) || Number.isNaN(baseVersion)) {
          const error = {
            code: 'VALIDATION_ERROR',
            message: 'configurationId, sessionId, opId, fieldPath, lamport and baseVersion are required',
          };
          ack?.({ ok: false, error });
          return;
        }

        try {
          const output = await this.collabSessionService.applyOperation({
            configurationId,
            sessionId,
            userId,
            opId,
            lamport,
            fieldPath,
            value: data?.value,
            baseVersion,
          });

          this.io.to(roomOf(output.sessionId)).emit('cad:collab:operation:applied', {
            requestId: payload?.requestId,
            data: {
              userId,
              opId,
              fieldPath,
              ...output,
            },
          });

          ack?.({ ok: true, data: output });
        } catch (error) {
          const mapped = normalizeError(error);
          socket.emit('cad:collab:error', { requestId: payload?.requestId, error: mapped });
          ack?.({ ok: false, error: mapped });
        }
      });

      socket.on('disconnect', () => {
        const tasks = Array.from(joinedSessions.entries()).map(async ([sessionId, configurationId]) => {
          try {
            await this.collabSessionService.leaveSession({
              sessionId,
              configurationId,
              userId,
            });
          } catch {
            // Ignore cleanup failures for already expired/closed sessions.
          }
        });

        void Promise.all(tasks);
      });
    });
  }
}