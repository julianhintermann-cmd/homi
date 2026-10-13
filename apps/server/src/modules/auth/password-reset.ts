import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { PASSWORD_RESET_PATH_PREFIX, PASSWORD_RESET_TOKEN_TTL_MINUTES } from '@homi/shared';
import type { MailMessage } from '../../lib/mailer';
import { createHashedToken } from '../../lib/tokens';
import { lockUserRow } from './credentials';

/**
 * Password reset by e-mail (§5): single-use tokens (32 random bytes, only the HMAC is stored),
 * valid for {@link PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes; a new request invalidates all older
 * tokens of the account. The raw token only ever exists in the e-mail – it is never logged.
 */

export const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000;

/** Reset mails per (normalised) e-mail address – stops mail bombing from many IPs. */
export const PASSWORD_RESET_PER_EMAIL_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 } as const;

export interface PasswordResetMailInput {
  to: string;
  displayName: string;
  link: string;
  ttlMinutes?: number;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Display names are user input: keep them on one line inside the mail. */
function singleLine(value: string): string {
  return value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim();
}

/** The German reset e-mail (plain text + minimal HTML). */
export function buildPasswordResetMail({
  to,
  displayName,
  link,
  ttlMinutes = PASSWORD_RESET_TOKEN_TTL_MINUTES,
}: PasswordResetMailInput): MailMessage {
  const name = singleLine(displayName);
  const greeting = name ? `Hallo ${name}` : 'Hallo';
  const intro =
    'Du hast angefordert, dein Passwort für Homi zurückzusetzen. Öffne den folgenden Link, um ein neues Passwort festzulegen:';
  const validity = `Der Link ist ${ttlMinutes} Minuten gültig und kann nur einmal verwendet werden.`;
  const ignore =
    'Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren. Dein Passwort bleibt unverändert.';

  const text = [greeting, '', intro, '', link, '', validity, '', ignore, '', 'Dein Homi'].join('\n');
  const html = [
    '<!doctype html><html lang="de-CH"><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111111;line-height:1.5">',
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;border-radius:26px;background:#111111;color:#F7F6F3;text-decoration:none;font-weight:600">Neues Passwort festlegen</a></p>`,
    `<p style="color:#6E6E73;font-size:13px">${escapeHtml(validity)}<br>${escapeHtml(ignore)}</p>`,
    '<p>Dein Homi</p>',
    '</body></html>',
  ].join('');

  return { to, subject: 'Homi: Passwort zurücksetzen', text, html };
}

/**
 * Issues a reset token for `email` and mails the link – a silent no-op for unknown addresses.
 * Runs detached from the request (the endpoint always answers 202 immediately, so neither the
 * response nor its timing reveals whether an account exists).
 */
export async function issuePasswordReset(app: FastifyInstance, email: string, log: FastifyBaseLogger): Promise<void> {
  const user = await app.prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true },
  });
  if (!user) return;

  const { token, tokenHash } = createHashedToken(app.config.sessionSecret);
  const now = new Date();
  const issued = await app.prisma.$transaction(async (tx) => {
    // Per-account lock (credentials.ts): concurrent requests (and a running confirmation) are
    // serialised, so "a new request invalidates every older token" holds – at most one is valid.
    if (!(await lockUserRow(tx, user.id))) return false;
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.create({
      data: { tokenHash, userId: user.id, createdAt: now, expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS) },
    });
    return true;
  });
  if (!issued) return; // the account was deleted in the meantime
  // Housekeeping outside the account lock: expired tokens of every account.
  await app.prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });

  const link = `${app.config.appUrl}${PASSWORD_RESET_PATH_PREFIX}${token}`;
  await app.mailer.send(buildPasswordResetMail({ to: user.email, displayName: user.displayName, link }));
  log.info({ userId: user.id }, 'password reset mail sent');
}

/**
 * Tracks fire-and-forget work started by requests so `app.close()` waits for it (no queries on
 * a closed pool, no unhandled rejections). Failures are logged without request data.
 */
export function createBackgroundTasks(app: FastifyInstance) {
  const pending = new Set<Promise<void>>();
  app.addHook('onClose', async () => {
    await Promise.allSettled([...pending]);
  });
  return {
    run(label: string, log: FastifyBaseLogger, task: () => Promise<void>): void {
      const promise = task()
        .catch((error: unknown) => log.error({ err: error }, `${label} failed`))
        .finally(() => pending.delete(promise));
      pending.add(promise);
    },
  };
}
