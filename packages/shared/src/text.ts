/*
 * Free-text hygiene shared by every user-entered text field (names, chat messages, search terms).
 *
 * PostgreSQL rejects U+0000 in text values ("invalid byte sequence for encoding UTF8: 0x00"), which
 * used to surface as a 500; other C0/C1 control characters have no business in text shown to other
 * household members either. Every request schema with free text applies one of these checks, so such
 * input is a `400 VALIDATION` (the server additionally maps a leftover PostgreSQL 22021 error to 400).
 */

/** Default message for text with control or bidi characters. */
export const INVALID_TEXT_CHARACTERS_MESSAGE = 'Der Text enthält ungültige Zeichen.';

/** C0/C1 control characters: NUL, TAB, LF, CR, ESC, DEL, … (Unicode category Cc). */
const CONTROL_CHARACTER = /\p{Cc}/u;
/** Control characters except TAB, LF and CR – for multi-line text such as chat messages. */
const CONTROL_CHARACTER_EXCEPT_LINE_BREAKS = /(?![\t\n\r])\p{Cc}/u;

export interface ControlCharacterOptions {
  /** Allow TAB, LF and CR (multi-line text). Default: `false`. */
  multiline?: boolean;
}

/** True if `value` contains a control character (NUL included). */
export function hasControlCharacter(value: string, options: ControlCharacterOptions = {}): boolean {
  return (options.multiline ? CONTROL_CHARACTER_EXCEPT_LINE_BREAKS : CONTROL_CHARACTER).test(value);
}

/**
 * Characters a single-line name must not contain: C0/C1 control characters (NUL, CR, LF, TAB, …),
 * line / paragraph separators and every bidi control – overrides/isolates (U+202A–U+202E,
 * U+2066–U+2069) and the direction marks LRM/RLM/ALM (U+200E, U+200F, U+061C) – which could reorder
 * what other members see ("\u202Egnp.exe").
 */
export function hasForbiddenNameCharacters(value: string): boolean {
  if (hasControlCharacter(value)) return true;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x2028 || code === 0x2029) return true;
    if (code === 0x200e || code === 0x200f || code === 0x061c) return true;
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) return true;
  }
  return false;
}

/**
 * A character that renders as something: not whitespace, not a default-ignorable code point
 * (zero-width space/joiners, word joiner, BOM, soft hyphen, variation selectors, Hangul fillers …)
 * and not the blank Braille pattern U+2800. ZWJ emoji sequences still pass – they contain visible
 * emoji around the joiner.
 */
const VISIBLE_CHARACTER = /[^\s\p{Default_Ignorable_Code_Point}\u2800\u115F\u1160\u3164\uFFA0]/u;

/** `false` for names that would show up blank ("\u200B", "\u2060", "\u00AD" …). */
export function hasVisibleNameCharacter(value: string): boolean {
  return VISIBLE_CHARACTER.test(value);
}
