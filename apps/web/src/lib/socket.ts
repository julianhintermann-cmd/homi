import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@homi/shared';

/** Typed Socket.IO client (same origin, cookie-authenticated, ARCHITECTURE §6). */
export type HomiSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Mirrors `SOCKET_PATH` / `SOCKET_UNAUTHORIZED` of @homi/shared (local copies keep zod out of the
 * entry chunk; hooks/useRealtimeSync.test.ts asserts equality).
 */
export const SOCKET_PATH = '/socket.io';
export const SOCKET_UNAUTHORIZED = 'UNAUTHORIZED';

let socket: HomiSocket | null = null;

/** Lazily created singleton. Never connects on its own – see `connectSocket`. */
export function getSocket(): HomiSocket {
  socket ??= io({
    path: SOCKET_PATH,
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

/** Connects when authenticated (idempotent). */
export function connectSocket(): HomiSocket {
  const instance = getSocket();
  if (!instance.connected && !instance.active) instance.connect();
  return instance;
}

/** Disconnects (logout / session lost). Listeners stay registered for the next session. */
export function disconnectSocket(): void {
  if (socket && (socket.connected || socket.active)) socket.disconnect();
}
