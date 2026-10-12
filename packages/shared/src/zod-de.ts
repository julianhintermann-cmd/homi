import { z } from 'zod';

/**
 * German (de-CH, no "ß") fallback messages for zod issues that have no explicit message.
 * Schemas in this package set explicit messages for every user-facing rule; this map only
 * guarantees that nothing English ever reaches the UI.
 */
export const germanErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined || issue.input === null ? 'Dieses Feld ist erforderlich.' : 'Ungültiger Wert.';
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.origin === 'string') {
        return min <= 1 ? 'Dieses Feld darf nicht leer sein.' : `Bitte mindestens ${min} Zeichen eingeben.`;
      }
      if (issue.origin === 'array' || issue.origin === 'set') return `Bitte mindestens ${min} Einträge angeben.`;
      return issue.inclusive === false
        ? `Der Wert muss grösser als ${min} sein.`
        : `Der Wert muss mindestens ${min} betragen.`;
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.origin === 'string') return `Bitte höchstens ${max} Zeichen eingeben.`;
      if (issue.origin === 'array' || issue.origin === 'set') return `Bitte höchstens ${max} Einträge angeben.`;
      if (issue.origin === 'file') return 'Die Datei ist zu gross.';
      return issue.inclusive === false
        ? `Der Wert muss kleiner als ${max} sein.`
        : `Der Wert darf höchstens ${max} betragen.`;
    }
    case 'invalid_format':
      switch (issue.format) {
        case 'email':
          return 'Bitte gib eine gültige E-Mail-Adresse ein.';
        case 'uuid':
        case 'guid':
          return 'Ungültige ID.';
        case 'url':
          return 'Bitte gib eine gültige URL ein.';
        case 'datetime':
        case 'date':
          return 'Ungültiges Datum.';
        default:
          return 'Ungültiges Format.';
      }
    case 'not_multiple_of':
      return `Der Wert muss ein Vielfaches von ${issue.divisor} sein.`;
    case 'unrecognized_keys':
      return `Unbekannte Felder: ${issue.keys.join(', ')}.`;
    case 'invalid_value':
      return 'Ungültige Auswahl.';
    case 'invalid_union':
    case 'invalid_key':
    case 'invalid_element':
    case 'custom':
    default:
      return 'Ungültige Eingabe.';
  }
};

let installed = false;

/**
 * Installs the German fallback error map (lowest priority, so explicit messages win) and
 * disables zod's eval-based JIT, which the strict CSP (`script-src 'self'`) forbids in the browser.
 * Idempotent; executed when `@homi/shared` is imported.
 */
export function installZodDefaults(): void {
  if (installed) return;
  installed = true;
  z.config({ localeError: germanErrorMap, jitless: true });
}
