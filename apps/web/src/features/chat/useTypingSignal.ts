import { useCallback, useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';

/** Re-announce "typing" at most this often while the user keeps typing. */
const RESEND_MS = 3_000;
/** Typing stops after this much inactivity. */
const IDLE_MS = 4_000;

/**
 * Emits `chat:typing` start/stop signals for the composer (best effort, socket only; the server
 * rate-limits and forwards them to the other conversation members).
 */
export function useTypingSignal(conversationId: string) {
  const started = useRef(false);
  const lastStart = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);

  const emit = useCallback(
    (typing: boolean) => {
      const socket = getSocket();
      if (socket.connected) socket.emit('chat:typing', { conversationId, typing });
    },
    [conversationId],
  );

  const stop = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    if (!started.current) return;
    started.current = false;
    emit(false);
  }, [emit]);

  const onInput = useCallback(
    (text: string) => {
      if (!text.trim()) {
        stop();
        return;
      }
      const now = Date.now();
      if (!started.current || now - lastStart.current > RESEND_MS) {
        started.current = true;
        lastStart.current = now;
        emit(true);
      }
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(stop, IDLE_MS);
    },
    [emit, stop],
  );

  useEffect(() => stop, [stop]);

  return { onInput, stop };
}
