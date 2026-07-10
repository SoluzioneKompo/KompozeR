/** WebSocket client for collaborative CAD sessions (join/presence/operations). */
import { io, type Socket } from 'socket.io-client';
import type { Category, ColumnDesign, ColumnPlan, ConfigurationDto, Environment } from '@/types/cad';

interface AckError {
  code: string;
  message: string;
}

interface AckResponse<T> {
  ok: boolean;
  data?: T;
  error?: AckError;
}

export type CollabFieldPath = 'name' | 'category' | 'environment' | 'columnPlan' | 'columnDesigns';

export interface CollabSessionOutput {
  sessionId: string;
  configurationId: string;
  lamport: number;
  participants: string[];
  ttlSeconds: number;
  snapshot: ConfigurationDto;
}

export interface CollabOperationOutput {
  sessionId: string;
  lamport: number;
  applied: boolean;
  duplicate: boolean;
  snapshot: ConfigurationDto;
}

export interface CollabPresencePayload {
  event: 'joined' | 'left';
  userId: string;
  sessionId: string;
  participants?: string[];
}

export interface CollabAppliedPayload {
  requestId?: string;
  data?: {
    userId: string;
    opId: string;
    fieldPath: CollabFieldPath;
  } & CollabOperationOutput;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getToken(): string {
  return localStorage.getItem('kompozer_token') ?? '';
}

class CadCollabSocketService {
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket) {
      return;
    }

    const token = getToken();
    if (!token) {
      return;
    }

    this.socket = io('/', {
      path: '/api/cad/collab/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
      timeout: 10000,
      query: { token },
    });
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.socket.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  onPresence(handler: (payload: CollabPresencePayload) => void): () => void {
    this.connect();
    this.socket?.on('cad:collab:presence', handler);
    return () => this.socket?.off('cad:collab:presence', handler);
  }

  onOperationApplied(handler: (payload: CollabAppliedPayload) => void): () => void {
    this.connect();
    this.socket?.on('cad:collab:operation:applied', handler);
    return () => this.socket?.off('cad:collab:operation:applied', handler);
  }

  onError(handler: (payload: { error?: AckError }) => void): () => void {
    this.connect();
    this.socket?.on('cad:collab:error', handler);
    return () => this.socket?.off('cad:collab:error', handler);
  }

  onConnectionRestored(handler: () => void): () => void {
    this.connect();

    const socket = this.socket;
    if (!socket) {
      return () => {};
    }

    let disconnectedSinceLastConnect = false;

    const onDisconnect = () => {
      disconnectedSinceLastConnect = true;
    };

    const onConnect = () => {
      if (disconnectedSinceLastConnect) {
        disconnectedSinceLastConnect = false;
        handler();
      }
    };

    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }

  async joinSession(configurationId?: string, sessionId?: string): Promise<CollabSessionOutput> {
    this.connect();
    if (!this.socket) {
      throw new Error('Connessione realtime non disponibile');
    }

    const payload = {
      requestId: randomId('join'),
      data: {
        configurationId,
        sessionId,
      },
    };

    return new Promise((resolve, reject) => {
      this.socket?.timeout(10000).emit(
        'cad:collab:join',
        payload,
        (err: Error | null, ack?: AckResponse<CollabSessionOutput>) => {
          if (err) {
            reject(new Error('Timeout join sessione collaborativa'));
            return;
          }

          if (!ack?.ok || !ack.data) {
            reject(new Error(ack?.error?.message ?? 'Join sessione collaborativa fallito'));
            return;
          }

          resolve(ack.data);
        },
      );
    });
  }

  async leaveSession(configurationId: string, sessionId: string): Promise<void> {
    this.connect();
    if (!this.socket) {
      return;
    }

    const payload = {
      requestId: randomId('leave'),
      data: {
        configurationId,
        sessionId,
      },
    };

    await new Promise<void>((resolve, reject) => {
      this.socket?.timeout(10000).emit(
        'cad:collab:leave',
        payload,
        (err: Error | null, ack?: AckResponse<unknown>) => {
          if (err) {
            reject(new Error('Timeout leave sessione collaborativa'));
            return;
          }

          if (!ack?.ok) {
            reject(new Error(ack?.error?.message ?? 'Leave sessione collaborativa fallito'));
            return;
          }

          resolve();
        },
      );
    });
  }

  async requestSnapshot(configurationId: string, sessionId: string): Promise<CollabSessionOutput> {
    this.connect();
    if (!this.socket) {
      throw new Error('Connessione realtime non disponibile');
    }

    const payload = {
      requestId: randomId('snapshot'),
      data: {
        configurationId,
        sessionId,
      },
    };

    return new Promise((resolve, reject) => {
      this.socket?.timeout(10000).emit(
        'cad:collab:snapshot',
        payload,
        (err: Error | null, ack?: AckResponse<CollabSessionOutput>) => {
          if (err) {
            reject(new Error('Timeout richiesta snapshot collaborativo'));
            return;
          }

          if (!ack?.ok || !ack.data) {
            reject(new Error(ack?.error?.message ?? 'Richiesta snapshot collaborativo fallita'));
            return;
          }

          resolve(ack.data);
        },
      );
    });
  }

  async applyOperation(input: {
    configurationId: string;
    sessionId: string;
    opId?: string;
    lamport: number;
    baseVersion: number;
    fieldPath: CollabFieldPath;
    value: string | Category | Environment | ColumnPlan | ColumnDesign[] | null;
  }): Promise<CollabOperationOutput> {
    this.connect();
    if (!this.socket) {
      throw new Error('Connessione realtime non disponibile');
    }

    const payload = {
      requestId: randomId('op'),
      data: {
        configurationId: input.configurationId,
        sessionId: input.sessionId,
        opId: input.opId ?? randomId('opid'),
        lamport: input.lamport,
        fieldPath: input.fieldPath,
        value: input.value,
        baseVersion: input.baseVersion,
      },
    };

    return new Promise((resolve, reject) => {
      this.socket?.timeout(10000).emit(
        'cad:collab:operation',
        payload,
        (err: Error | null, ack?: AckResponse<CollabOperationOutput>) => {
          if (err) {
            reject(new Error('Timeout operazione collaborativa'));
            return;
          }

          if (!ack?.ok || !ack.data) {
            reject(new Error(ack?.error?.message ?? 'Operazione collaborativa fallita'));
            return;
          }

          resolve(ack.data);
        },
      );
    });
  }
}

export const cadCollabSocket = new CadCollabSocketService();
