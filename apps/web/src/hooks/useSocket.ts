import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import { connectSocket, disconnectSocket, getSocket, SOCKET_UNAUTHORIZED, type HomiSocket } from '@/lib/socket';

/** The typed singleton socket (for chat send/typing/read and custom listeners). */
export function useSocket(): HomiSocket {
  return getSocket();
}

/**
 * Connects the socket while authenticated and disconnects otherwise (logout, expired session).
 * An `UNAUTHORIZED` handshake error means the session cookie is gone → refetch `['me']`.
 */
export function useSocketConnection(isAuthenticated: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return undefined;
    }
    const socket = connectSocket();
    const onConnectError = (error: Error): void => {
      if (error.message === SOCKET_UNAUTHORIZED) void client.invalidateQueries({ queryKey: queryKeys.me });
    };
    socket.on('connect_error', onConnectError);
    return () => {
      socket.off('connect_error', onConnectError);
    };
  }, [client, isAuthenticated]);
}

function subscribeToConnection(onChange: () => void): () => void {
  const socket = getSocket();
  socket.on('connect', onChange);
  socket.on('disconnect', onChange);
  return () => {
    socket.off('connect', onChange);
    socket.off('disconnect', onChange);
  };
}

/** `true` while the realtime connection is established. */
export function useSocketConnected(): boolean {
  return useSyncExternalStore(
    subscribeToConnection,
    () => getSocket().connected,
    () => false,
  );
}
