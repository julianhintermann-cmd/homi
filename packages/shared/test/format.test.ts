import { describe, expect, it } from 'vitest';
import {
  formatCHF,
  formatCHFDelta,
  formatChatDayLabel,
  formatChatTimestamp,
  formatDate,
  formatNumber,
  formatOptionalCHF,
  formatQuantity,
  formatRelativeTime,
  formatTime,
  formatUnitPrice,
} from '../src/index';

const TZ = 'Europe/Zurich';
// Monday, 12 October 2026, 16:00 in Zurich (UTC+2, CEST)
const NOW = new Date('2026-10-12T14:00:00Z');
const opts = { now: NOW, timeZone: TZ };

describe('formatCHF', () => {
  it('formats with Swiss grouping and two decimals', () => {
    expect(formatCHF('2485.50')).toBe('CHF 2’485.50');
    expect(formatCHF('2485.5')).toBe('CHF 2’485.50');
    expect(formatCHF('8.5')).toBe('CHF 8.50');
    expect(formatCHF('0')).toBe('CHF 0.00');
    expect(formatCHF('1234567.891')).toBe('CHF 1’234’567.89');
    expect(formatCHF('-12.3')).toBe('CHF -12.30');
    expect(formatCHF(42.8)).toBe('CHF 42.80');
  });

  it('never renders unknown prices as CHF 0.00', () => {
    expect(formatOptionalCHF(null)).toBe('–');
    expect(formatOptionalCHF(undefined, '')).toBe('');
    expect(formatOptionalCHF('3')).toBe('CHF 3.00');
  });

  it('formats signed deltas', () => {
    expect(formatCHFDelta('42.8')).toBe('+ CHF 42.80');
    expect(formatCHFDelta('-1250')).toBe('- CHF 1’250.00');
    expect(formatCHFDelta('0.00')).toBe('CHF 0.00');
  });
});

describe('formatQuantity', () => {
  it.each([
    ['3', 'STUECK', '3 Stück'],
    ['2', 'FLASCHE', '2 Flaschen'],
    ['1', 'FLASCHE', '1 Flasche'],
    ['1.000', 'FLASCHE', '1 Flasche'],
    ['1.5', 'KILOGRAMM', '1.5 kg'],
    ['250', 'GRAMM', '250 g'],
    ['4', 'ROLLE', '4 Rollen'],
    ['0', 'PACKUNG', '0 Packungen'],
    ['1', 'PACKUNG', '1 Packung'],
    ['2', 'TUBE', '2 Tuben'],
    ['3', 'DOSE', '3 Dosen'],
    ['1500', 'MILLILITER', '1’500 ml'],
    ['2', 'LITER', '2 Liter'],
  ] as const)('(%s, %s) → %s', (quantity, unit, expected) => {
    expect(formatQuantity(quantity, unit)).toBe(expected);
  });

  it('accepts numbers from UI state', () => {
    expect(formatQuantity(1.5, 'KILOGRAMM')).toBe('1.5 kg');
  });

  it('formats plain numbers', () => {
    expect(formatNumber('1250.500')).toBe('1’250.5');
    expect(formatNumber('-3')).toBe('-3');
  });
});

describe('formatUnitPrice', () => {
  it('uses the short unit suffix', () => {
    expect(formatUnitPrice('8.5', 'FLASCHE')).toBe('CHF 8.50 / Fl.');
    expect(formatUnitPrice('1.2', 'STUECK')).toBe('CHF 1.20 / Stk.');
    expect(formatUnitPrice('12.90', 'KILOGRAMM')).toBe('CHF 12.90 / kg');
  });
});

describe('date formatting', () => {
  it('formats time and date in the given zone', () => {
    expect(formatTime('2026-10-12T12:32:00Z', { timeZone: TZ })).toBe('14:32');
    expect(formatTime('2026-10-11T22:05:00Z', { timeZone: TZ })).toBe('00:05');
    expect(formatDate('2026-10-12T12:32:00Z', { timeZone: TZ })).toBe('12.10.2026');
  });

  it('formats chat list timestamps relative to now', () => {
    expect(formatChatTimestamp('2026-10-12T12:32:00Z', opts)).toBe('14:32');
    // 23:30 Zurich on Sunday 11 Oct is "yesterday" even though it is < 24 h ago
    expect(formatChatTimestamp('2026-10-11T21:30:00Z', opts)).toBe('Gestern');
    expect(formatChatTimestamp('2026-10-08T10:00:00Z', opts)).toBe('Donnerstag');
    expect(formatChatTimestamp('2026-10-05T10:00:00Z', opts)).toBe('05.10.26');
    // a clock skewed into the future is treated as today
    expect(formatChatTimestamp('2026-10-12T14:05:00Z', opts)).toBe('16:05');
  });

  it('formats chat day separators', () => {
    expect(formatChatDayLabel('2026-10-12T08:00:00Z', opts)).toBe('Heute');
    expect(formatChatDayLabel('2026-10-11T08:00:00Z', opts)).toBe('Gestern');
    expect(formatChatDayLabel('2026-10-01T08:00:00Z', opts)).toBe('Donnerstag, 1. Oktober');
    expect(formatChatDayLabel('2025-03-03T08:00:00Z', opts)).toBe('3. März 2025');
  });

  it('formats relative activity times', () => {
    expect(formatRelativeTime('2026-10-12T13:59:40Z', opts)).toBe('Gerade eben');
    expect(formatRelativeTime('2026-10-12T13:55:00Z', opts)).toBe('vor 5 Min.');
    expect(formatRelativeTime('2026-10-12T11:00:00Z', opts)).toBe('vor 3 Std.');
    expect(formatRelativeTime('2026-10-11T10:00:00Z', opts)).toBe('Gestern');
    expect(formatRelativeTime('2026-10-09T10:00:00Z', opts)).toBe('vor 3 Tagen');
    expect(formatRelativeTime('2026-09-01T10:00:00Z', opts)).toBe('01.09.26');
  });

  it('rejects invalid dates', () => {
    expect(() => formatTime('not a date')).toThrow(RangeError);
  });
});
