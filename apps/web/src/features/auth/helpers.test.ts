import { describe, expect, it } from 'vitest';
import {
  checkPasswordPolicy,
  DisplayNameSchema,
  LoginRequestSchema,
  PasswordSchema,
  RegisterRequestSchema,
} from '@homi/shared';
import { ApiError, networkError } from '@/api/client';
import { firstInvalidField, mapSubmitError, validateFields } from './formErrors';
import { validRedirectTarget, withRedirect } from './redirect';

describe('checkPasswordPolicy', () => {
  const metIds = (password: string, email?: string) =>
    checkPasswordPolicy(password, email)
      .filter((rule) => rule.met)
      .map((rule) => rule.id);

  it('evaluates each rule of the shared policy', () => {
    expect(checkPasswordPolicy('').map((rule) => rule.label)).toEqual([
      'Mindestens 10 Zeichen',
      'Mindestens ein Buchstabe',
      'Mindestens eine Ziffer oder ein Sonderzeichen',
    ]);
    expect(metIds('')).toEqual([]);
    expect(metIds('sommerwiese')).toEqual(['length', 'letter']);
    expect(metIds('1234567890')).toEqual(['length', 'digitOrSymbol']);
    expect(metIds('Grüezi wohl!')).toEqual(['length', 'letter', 'digitOrSymbol']);
    expect(metIds('ÄÖÜäöüéàèç-')).toEqual(['length', 'letter', 'digitOrSymbol']);
  });

  it('adds the e-mail rule when an address is known', () => {
    expect(metIds('lena@example.ch', 'Lena@Example.ch ')).toEqual(['length', 'letter', 'digitOrSymbol']);
    expect(metIds('Sommer-Wiese-7', 'lena@example.ch')).toEqual(['length', 'letter', 'digitOrSymbol', 'notEmail']);
    expect(checkPasswordPolicy('x', '  ')).toHaveLength(3);
  });

  it('agrees with PasswordSchema', () => {
    for (const sample of ['', 'kurz1', 'sommerwiese', '1234567890', 'Sommer-Wiese-7', 'zehnZeich1', '          ']) {
      const allMet = checkPasswordPolicy(sample).every((rule) => rule.met);
      expect(PasswordSchema.safeParse(sample).success, sample).toBe(allMet);
    }
  });
});

describe('form error helpers', () => {
  it('validates with the shared schemas (first message per field)', () => {
    expect(validateFields(LoginRequestSchema, { email: '', password: '' })).toEqual({
      email: 'Bitte gib deine E-Mail-Adresse ein.',
      password: 'Bitte gib dein Passwort ein.',
    });
    expect(validateFields(LoginRequestSchema, { email: ' Julia@Example.ch ', password: 'x' })).toEqual({});
    const errors = validateFields<'displayName' | 'email' | 'password'>(RegisterRequestSchema, {
      displayName: 'Lena',
      email: 'kein-mail',
      password: 'Sommer-Wiese-7',
    });
    expect(errors).toEqual({ email: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
    expect(firstInvalidField(['displayName', 'email', 'password'] as const, errors)).toBe('email');
  });

  it('maps server errors onto fields or the form', () => {
    const fields = ['email', 'password'] as const;
    const validation = new ApiError({
      status: 400,
      code: 'VALIDATION',
      message: 'Bitte überprüfe deine Eingaben.',
      details: { fieldErrors: { password: 'Zu kurz.', other: 'Unbekannt.' }, formErrors: [] },
    });
    expect(mapSubmitError(validation, fields)).toEqual({
      fieldErrors: { password: 'Zu kurz.' },
      formError: 'Unbekannt.',
    });

    const taken = new ApiError({ status: 409, code: 'EMAIL_TAKEN', message: 'Schon vergeben.' });
    expect(mapSubmitError(taken, fields, { EMAIL_TAKEN: 'email' })).toEqual({
      fieldErrors: { email: 'Schon vergeben.' },
      formError: null,
    });

    const credentials = new ApiError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'E-Mail oder Passwort ist falsch.',
    });
    expect(mapSubmitError(credentials, fields)).toEqual({
      fieldErrors: {},
      formError: 'E-Mail oder Passwort ist falsch.',
    });
    expect(mapSubmitError(networkError(), fields).formError).toBe(
      'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.',
    );
    expect(mapSubmitError(new Error('boom'), fields).formError).toBe(
      'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.',
    );
    const malformed = new ApiError({
      status: 400,
      code: 'VALIDATION',
      message: 'Bitte überprüfe deine Eingaben.',
      details: 'x',
    });
    expect(mapSubmitError(malformed, fields)).toEqual({
      fieldErrors: {},
      formError: 'Bitte überprüfe deine Eingaben.',
    });
  });
});

describe('redirect helpers', () => {
  it('only carries safe same-origin targets', () => {
    expect(validRedirectTarget('/einladung/abc')).toBe('/einladung/abc');
    expect(validRedirectTarget('https://evil.example')).toBeNull();
    expect(validRedirectTarget('//evil.example')).toBeNull();
    expect(validRedirectTarget('/login')).toBeNull();
    expect(validRedirectTarget(null)).toBeNull();
    expect(withRedirect('/registrieren', '/einladung/a b')).toBe('/registrieren?redirect=%2Feinladung%2Fa%20b');
    expect(withRedirect('/registrieren', '//evil.example')).toBe('/registrieren');
    expect(withRedirect('/login', null)).toBe('/login');
  });
});

describe('DisplayNameSchema', () => {
  const issue = (value: string) => {
    const result = DisplayNameSchema.safeParse(value);
    return result.success ? null : result.error.issues[0]?.message;
  };

  it('accepts ordinary names, emoji sequences and scripts that need ZWNJ/ZWJ', () => {
    expect(DisplayNameSchema.parse('  Julia Meier ')).toBe('Julia Meier');
    expect(DisplayNameSchema.parse('Anna-Katharina Brunschwiler')).toBe('Anna-Katharina Brunschwiler');
    expect(DisplayNameSchema.parse('Julia \u{1F469}‍\u{1F4BB}')).toBe('Julia \u{1F469}‍\u{1F4BB}');
    expect(DisplayNameSchema.parse('می‌خواهم')).toBe('می‌خواهم');
    expect(DisplayNameSchema.parse('René')).toBe('René'); // stored NFC-normalised
  });

  it('rejects control characters (NUL, line breaks) and invisible format characters', () => {
    for (const value of ['Ju\u0000lia', 'Zeile1\nZeile2', 'Tab\tName', 'Admin‮gnp.exe', 'Ju​lia', 'A⁦B']) {
      expect(issue(value)).toBe('Der Name enthält unzulässige Zeichen.');
    }
  });

  it('requires at least one visible character', () => {
    for (const value of ['', '   ', '​​', 'ㅤ', '⠀ᅟ', '́']) {
      expect(issue(value)).toBe('Bitte gib deinen Namen ein.');
    }
    expect(issue('x'.repeat(61))).toBe('Der Name darf höchstens 60 Zeichen lang sein.');
  });
});
