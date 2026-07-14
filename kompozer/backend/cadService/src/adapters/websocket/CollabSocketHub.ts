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
    sessionCode?: string;
  };
};

type LeavePayload = {
  requestId?: string;
  data?: {
    configurationId?: string;
    sessionCode?: string;
  };
};

type SnapshotPayload = {
  requestId?: string;
  data?: {
    configurationId?: string;
    sessionCode?: string;
  };
};

type ApplyOperationPayload = {
  requestId?: string;
  data?: {
    configurationId?: string;
    sessionCode?: string;
    opId?: string;
    lamport?: number;
    fieldPath?: CollabFieldPath;
    value?: unknown;
    baseVersion?: number;
  };
};

function roomOf(sessionCode: string): string {
  return `cad:collab:${sessionCode}`;
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

      const joinedSessions = new Map<string, string>(); // sessionCode → configurationId

      socket.on('cad:collab:join', async (payload: JoinPayload, ack?: (response: AckResponse<unknown>) => void) => {
        const sessionCode = payload?.data?.sessionCode?.trim().toUpperCase() || '';

        if (!sessionCode) {
          const error = { code: 'VALIDATION_ERROR', message: 'sessionCode is required' };
          ack?.({ ok: false, error });
          return;
        }

        try {
          const output = await this.collabSessionService.joinByCode({
            sessionCode,
            userId,
          });

          socket.join(roomOf(output.sessionCode));
          joinedSessions.set(output.sessionCode, output.configurationId);

          socket.emit('cad:collab:joined', {
            requestId: payload?.requestId,
            data: output,
          });

          socket.to(roomOf(output.sessionCode)).emit('cad:collab:presence', {
            event: 'joined',
            userId,
            sessionCode: output.sessionCode,
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
        const sessionCode = payload?.data?.sessionCode?.trim().toUpperCase() || '';

        if (!configurationId || !sessionCode) {
          const error = {
            code: 'VALIDATION_ERROR',
            message: 'configurationId and sessionCode are required',
          };
          ack?.({ ok: false, error });
          return;
        }

        try {
          await this.collabSessionService.leaveSession({
            sessionCode,
            configurationId,
            userId,
          });

          socket.leave(roomOf(sessionCode));
          joinedSessions.delete(sessionCode);

          socket.to(roomOf(sessionCode)).emit('cad:collab:presence', {
            event: 'left',
            userId,
            sessionCode,
          });

          ack?.({ ok: true, data: { sessionCode, left: true } });
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
        const sessionCode = payload?.data?.sessionCode?.trim().toUpperCase() || '';

        if (!configurationId || !sessionCode) {
          const error = {
            code: 'VALIDATION_ERROR',
            message: 'configurationId and sessionCode are required',
          };
          ack?.({ ok: false, error });
          return;
        }

        try {
          const output = await this.collabSessionService.getSnapshot({
            sessionCode,
            configurationId,
            userId,
          });
          socket.join(roomOf(output.sessionCode));
          joinedSessions.set(output.sessionCode, output.configurationId);
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
        const sessionCode = data?.sessionCode?.trim().toUpperCase() || '';
        const opId = data?.opId?.trim() || '';
        const fieldPath = data?.fieldPath;
        const lamport = Number(data?.lamport);
        const baseVersion = Number(data?.baseVersion);

        if (!configurationId || !sessionCode || !opId || !fieldPath || Number.isNaN(lamport) || Number.isNaN(baseVersion)) {
          const error = {
            code: 'VALIDATION_ERROR',
            message: 'configurationId, sessionCode, opId, fieldPath, lamport and baseVersion are required',
          };
          ack?.({ ok: false, error });
          return;
        }

        try {
          const output = await this.collabSessionService.applyOperation({
            configurationId,
            sessionCode,
            userId,
            opId,
            lamport,
            fieldPath,
            value: data?.value,
            baseVersion,
          });

          this.io.to(roomOf(output.sessionCode)).emit('cad:collab:operation:applied', {
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
        for (const [sessionCode, configurationId] of joinedSessions.entries()) {
          if (this.collabSessionService.isOwner(sessionCode, userId)) {
            // Owner disconnected: notify remaining participants and destroy session.
            this.io.to(roomOf(sessionCode)).emit('cad:collab:owner-disconnected', {
              sessionCode,
              configurationId,
            });
            this.collabSessionService.destroySession(sessionCode);
          } else {
            // Participant left: silent cleanup, no await needed.
            void this.collabSessionService.leaveSession({
              sessionCode,
              configurationId,
              userId,
            }).then(() => {
              this.io.to(roomOf(sessionCode)).emit('cad:collab:presence', {
                event: 'left',
                userId,
                sessionCode,
              });
            }).catch(() => {
              // Ignore cleanup failures for already expired/closed sessions.
            });
          }
        }
      });
    });
  }

  /**
   * Notifies participants of a recovered session that they must resynchronise
   * (re-fetch the snapshot) after a server crash + checkpoint restore.
   */
  broadcastResync(sessionCode: string): void {
    this.io.to(roomOf(sessionCode)).emit('cad:collab:resync', { sessionCode });
  }
}