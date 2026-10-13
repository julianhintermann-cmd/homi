import type { InvitationDto, InvitationStatus } from '@homi/shared';
import { isApiError } from '@/api/client';
import { calendarDaysBetween, formatDate, formatTime, type DateFormatOptions } from '@/lib/format';
import { paths, REDIRECT_PARAM } from '@/routes/paths';

const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;
const LINK = /\/einladung\/([A-Za-z0-9_-]{20,128})(?:[/?#]|$)/;

/**
 * Extracts the invitation token from a pasted link (`https://…/einladung/<token>`), a path, or the
 * bare token. Returns `null` for anything else. Only the token is used – the user is always sent to
 * this app's own `/einladung/<token>` route, never to a pasted host (no open redirect).
 */
export function invitationTokenFromInput(input: string): string | null {
  const text = input.trim();
  if (TOKEN.test(text)) return text;
  const match = LINK.exec(text);
  return match?.[1] ?? null;
}

/**
 * Sign-in / registration link that returns to the invitation: `/login?redirect=/einladung/<token>`.
 * The path is deliberately NOT percent-encoded (`/` is allowed in a query value, tokens are
 * base64url): on a full page load the server's request logger redacts `/einladung/<token>`
 * anywhere in the URL, while the encoded form `%2Feinladung%2F<token>` would be logged verbatim.
 */
export function signInLinkFor(path: string, token: string): string {
  return `${path}?${REDIRECT_PARAM}=${paths.invitation(encodeURIComponent(token))}`;
}

/** UI state of an invitation link: the server statuses plus `invalid` (unknown/malformed token → 404). */
export type InvitationViewState = InvitationStatus | 'invalid';

/** State from an accept/preview error (`410 INVITATION_INVALID` carries `details.status`); `null` = other error. */
export function invitationStateFromError(error: unknown): InvitationViewState | null {
  if (!isApiError(error)) return null;
  if (error.status === 404) return 'invalid';
  if (error.code === 'INVITATION_INVALID') {
    const status = (error.details as { status?: unknown } | undefined)?.status;
    return status === 'expired' || status === 'revoked' || status === 'used' ? status : 'invalid';
  }
  return null;
}

/**
 * Subtitle of an active invitation in the invite sheet: creator plus creation time, so links with
 * the same role and expiry can be told apart before one is revoked –
 * "Erstellt von Julian · heute, 01:23" / "· gestern, 18:05" / "· 12.10.2026, 18:05".
 */
export function invitationCreatedLabel(
  invitation: Pick<InvitationDto, 'createdAt' | 'createdBy'>,
  options: DateFormatOptions = {},
): string {
  const days = calendarDaysBetween(invitation.createdAt, options);
  const day = days <= 0 ? 'heute' : days === 1 ? 'gestern' : formatDate(invitation.createdAt, options);
  const when = `${day}, ${formatTime(invitation.createdAt, options)}`;
  return invitation.createdBy ? `Erstellt von ${invitation.createdBy.displayName} · ${when}` : `Erstellt ${when}`;
}
