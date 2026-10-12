import fp from 'fastify-plugin';
import { Server, type Socket } from 'socket.io';
import {
  API_ERRORS,
  SESSION_COOKIE_NAME,
  SOCKET_PATH,
  SOCKET_UNAUTHORIZED,
  type ApiErrorCode,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketAckError,
  type SyncEvent,
} from '@homi/shared';
import { isAllowedOrigin } from './csrf';

/**
 * Socket.IO on the Fastify HTTP server (§6): same origin, cookie-authenticated handshake,
 * rooms `user:<id>` and `household:<id>`. Feature modules register connection handlers via
 * `app.realtime.onConnection()` and broadcast with `emitToHousehold` / `emitToUsers` /
 * `emitSync` **after** their DB transaction committed.
 */

export interface SocketData {
  userId: string;
  displayName: string;
  sessionId: string;
}

type InterServerEvents = Record<string, never>;

export type HomiServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type HomiSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Called synchronously for every authenticated connection – attach event listeners here.
 * Handlers must validate every payload (zod) and check membership per event.
 */
export type ConnectionHandler = (socket: HomiSocket) => void;

type EventArgs<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>;

export interface Realtime {
  readonly io: HomiServer;
  onConnection(handler: ConnectionHandler): void;
  emitToHousehold<E extends keyof ServerToClientEvents>(householdId: string, event: E, ...args: EventArgs<E>): void;
  emitToUsers<E extends keyof ServerToClientEvents>(userIds: Iterable<string>, event: E, ...args: EventArgs<E>): void;
  /** `sync` to `household:<id>`. */
  emitSync(event: SyncEvent): void;
  /** Re-computes the household rooms of all sockets of a user after membership changes. */
  syncUserRooms(userId: string): Promise<void>;
  /** Disconnects sockets of a user (all, one session, or all but one session). */
  disconnectUser(userId: string, options?: { sessionId?: string; exceptSessionId?: string }): Promise<void>;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const householdRoom = (householdId: string) => `household:${householdId}`;

/** Ack payload for a failed client → server event. */
export function socketAckError(code: ApiErrorCode, message?: string): SocketAckError {
  return { ok: false, error: { code, message: message ?? API_ERRORS[code].message } };
}

/** Narrows an untrusted ack argument (clients may omit it or send garbage). */
export function toAck<T>(ack: unknown): (response: T) => void {
  return typeof ack === 'function' ? (ack as (response: T) => void) : () => undefined;
}

export const realtimePlugin = fp(
  async (app) => {
    const handlers: ConnectionHandler[] = [];

    const io: HomiServer = new Server(app.server, {
      path: SOCKET_PATH,
      serveClient: false,
      cookie: false,
      transports: ['websocket', 'polling'],
      maxHttpBufferSize: 100_000,
      allowRequest(req, callback) {
        const origin = req.headers.origin;
        if (origin !== undefined && !isAllowedOrigin(origin, app.config, req.headers)) {
          app.log.warn({ origin }, 'socket.io handshake rejected: origin not allowed');
          callback('FORBIDDEN_ORIGIN', false);
          return;
        }
        callback(null, true);
      },
    });

    io.use((socket, next) => {
      const header = socket.request.headers.cookie;
      const token = header ? app.parseCookie(header)[SESSION_COOKIE_NAME] : undefined;
      if (!token) {
        next(new Error(SOCKET_UNAUTHORIZED));
        return;
      }
      app.sessions
        .validate(token)
        .then((result) => {
          if (!result) {
            next(new Error(SOCKET_UNAUTHORIZED));
            return;
          }
          socket.data = {
            userId: result.user.id,
            displayName: result.user.displayName,
            sessionId: result.session.id,
          };
          next();
        })
        .catch((error: unknown) => {
          app.log.error({ err: error }, 'socket.io authentication failed');
          next(new Error('UNAVAILABLE'));
        });
    });

    io.on('connection', (socket) => {
      const { userId } = socket.data;
      // Listeners first (synchronously) so no early client event is lost …
      for (const handler of handlers) {
        try {
          handler(socket);
        } catch (error) {
          app.log.error({ err: error }, 'socket connection handler failed');
        }
      }
      // … then the rooms.
      void socket.join(userRoom(userId));
      app.prisma.householdMember
        .findMany({ where: { userId }, select: { householdId: true } })
        .then((memberships) => {
          if (socket.connected) void socket.join(memberships.map((m) => householdRoom(m.householdId)));
        })
        .catch((error: unknown) => {
          app.log.error({ err: error, userId }, 'failed to join household rooms');
          socket.disconnect(true);
        });
    });

    const emitTo = (rooms: string | string[], event: string, args: unknown[]) => {
      const target = io.to(rooms) as unknown as { emit: (ev: string, ...rest: unknown[]) => boolean };
      target.emit(event, ...args);
    };

    const realtime: Realtime = {
      io,
      onConnection(handler) {
        handlers.push(handler);
      },
      emitToHousehold(householdId, event, ...args) {
        emitTo(householdRoom(householdId), event, args);
      },
      emitToUsers(userIds, event, ...args) {
        const rooms = [...new Set(userIds)].map(userRoom);
        if (rooms.length > 0) emitTo(rooms, event, args);
      },
      emitSync(event) {
        emitTo(householdRoom(event.householdId), 'sync', [event]);
      },
      async syncUserRooms(userId) {
        const sockets = await io.in(userRoom(userId)).fetchSockets();
        if (sockets.length === 0) return;
        const memberships = await app.prisma.householdMember.findMany({
          where: { userId },
          select: { householdId: true },
        });
        const desired = new Set(memberships.map((m) => householdRoom(m.householdId)));
        for (const socket of sockets) {
          for (const room of socket.rooms) {
            if (room.startsWith('household:') && !desired.has(room)) socket.leave(room);
          }
          if (desired.size > 0) socket.join([...desired]);
        }
      },
      async disconnectUser(userId, options = {}) {
        const sockets = await io.in(userRoom(userId)).fetchSockets();
        for (const socket of sockets) {
          if (options.sessionId && socket.data.sessionId !== options.sessionId) continue;
          if (options.exceptSessionId && socket.data.sessionId === options.exceptSessionId) continue;
          socket.disconnect(true);
        }
      },
    };

    app.decorate('realtime', realtime);

    // Close sockets before Fastify closes the HTTP server, otherwise open WebSockets keep it alive.
    app.addHook('preClose', async () => {
      io.local.disconnectSockets(true);
      io.engine.close();
    });
  },
  { name: 'homi-realtime', dependencies: ['@fastify/cookie', 'homi-core'], fastify: '5.x' },
);
