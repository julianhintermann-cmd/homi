import type { MeResponse } from '@homi/shared';
import { isApiError } from '@/api/client';

export type SessionStatus =
  | { kind: 'loading' }
  | { kind: 'unreachable'; offline: boolean }
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; me: MeResponse };

interface MeQueryLike {
  data: MeResponse | null | undefined;
  error: unknown;
  failureReason: unknown;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}

/**
 * Session state from the `['me']` query. Cached data always wins (a failed background
 * refetch keeps the user logged in); without data, a paused (offline) or failing request
 * means "unreachable" rather than "logged out".
 */
export function deriveSessionStatus(me: MeQueryLike): SessionStatus {
  if (me.data) return { kind: 'authenticated', me: me.data };
  if (me.data === null) return { kind: 'anonymous' };
  const problem = me.error ?? me.failureReason;
  if (me.fetchStatus === 'paused') return { kind: 'unreachable', offline: true };
  if (problem) return { kind: 'unreachable', offline: isApiError(problem) && problem.isNetworkError };
  return { kind: 'loading' };
}
