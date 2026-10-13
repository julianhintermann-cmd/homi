import { PASSWORD_RESET_TOKEN_TTL_MINUTES } from '@homi/shared/core';

/** German texts of the auth screens that tests and several components share. */

export const RESET_DISABLED_MESSAGE =
  'Passwort-Zurücksetzen per E-Mail ist auf diesem Server nicht eingerichtet. Wende dich an die Person, die Homi betreibt.';

/** Same text for every address – whether an account exists is never revealed. */
export const RESET_REQUESTED_MESSAGE = `Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Er ist ${PASSWORD_RESET_TOKEN_TTL_MINUTES} Minuten gültig.`;

export const PASSWORDS_DO_NOT_MATCH = 'Die Passwörter stimmen nicht überein.';

export const INVALID_RESET_LINK_MESSAGE =
  'Dieser Link ist ungültig, abgelaufen oder wurde schon verwendet. Fordere einfach einen neuen an.';
