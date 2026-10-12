import { describe, expect, it } from 'vitest';
import {
  DecimalError,
  addDecimals,
  compareDecimals,
  fromScaled,
  isDecimalString,
  lineTotal,
  multiplyDecimals,
  negateDecimal,
  normalizeDecimalInput,
  numberToDecimalString,
  subtractDecimals,
  sumDecimals,
  toFixedDecimal,
  toMoneyString,
  toScaled,
  trimDecimal,
} from '../src/index';

describe('isDecimalString', () => {
  it('accepts canonical decimal strings', () => {
    expect(isDecimalString('8.50')).toBe(true);
    expect(isDecimalString('0')).toBe(true);
    expect(isDecimalString('12345.678')).toBe(true);
  });

  it('rejects malformed input and non-strings', () => {
    for (const value of ['', '8,50', '.5', '5.', '1e3', 'abc', ' 1', '--1', 8.5, null]) {
      expect(isDecimalString(value)).toBe(false);
    }
  });

  it('applies scale, sign and range rules', () => {
    expect(isDecimalString('8.505', { maxScale: 2 })).toBe(false);
    expect(isDecimalString('-1')).toBe(false);
    expect(isDecimalString('-1', { allowNegative: true })).toBe(true);
    expect(isDecimalString('100.01', { max: '100' })).toBe(false);
    expect(isDecimalString('0.5', { min: '1' })).toBe(false);
  });
});

describe('normalizeDecimalInput', () => {
  it.each([
    ['8,50', '8.50'],
    ['8.5', '8.5'],
    [' 1’250.5 ', '1250.5'],
    ["1'000", '1000'],
    ['.5', '0.5'],
    ['5.', '5'],
    ['007', '7'],
    ['+3', '3'],
    ['-0', '0'],
    ['-2,5', '-2.5'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDecimalInput(input)).toBe(expected);
  });

  it.each(['', '  ', 'abc', '1.000,50', '1,2,3', '1.2.3', '.', '-', '1e5'])('rejects %j', (input) => {
    expect(normalizeDecimalInput(input)).toBeNull();
  });
});

describe('scaled bigint conversion', () => {
  it('converts to and from scaled units', () => {
    expect(toScaled('8.50', 2)).toBe(850n);
    expect(toScaled('8.5', 2)).toBe(850n);
    expect(toScaled('-0.05', 2)).toBe(-5n);
    expect(fromScaled(850n, 2)).toBe('8.50');
    expect(fromScaled(-5n, 2)).toBe('-0.05');
    expect(fromScaled(0n, 2)).toBe('0.00');
    expect(fromScaled(42n, 0)).toBe('42');
  });

  it('rounds half away from zero', () => {
    expect(toScaled('1.005', 2)).toBe(101n);
    expect(toScaled('1.004', 2)).toBe(100n);
    expect(toScaled('-1.005', 2)).toBe(-101n);
    expect(toFixedDecimal('2.675', 2)).toBe('2.68'); // the classic float trap
  });

  it('throws in exact mode when precision would be lost', () => {
    expect(() => toScaled('1.005', 2, 'exact')).toThrow(DecimalError);
    expect(() => toScaled('nope', 2)).toThrow(DecimalError);
  });
});

describe('arithmetic', () => {
  it('adds without float errors', () => {
    expect(addDecimals('0.1', '0.2')).toBe('0.30');
    expect(sumDecimals(['8.50', '2.25', '0.05'])).toBe('10.80');
    expect(sumDecimals([])).toBe('0.00');
    expect(subtractDecimals('10', '12.5')).toBe('-2.50');
  });

  it('multiplies quantity × price exactly and rounds once', () => {
    expect(multiplyDecimals('3', '8.50')).toBe('25.50');
    expect(multiplyDecimals('1.5', '2.99')).toBe('4.49'); // 4.485 → 4.49
    expect(multiplyDecimals('0.333', '3.00')).toBe('1.00'); // 0.999 → 1.00
    expect(multiplyDecimals('99999.999', '99999.99')).toBe('9999998900.00');
    expect(lineTotal('2', null)).toBeNull();
    expect(lineTotal('2', '1.25')).toBe('2.50');
  });

  it('compares, negates and trims', () => {
    expect(compareDecimals('1.50', '1.5')).toBe(0);
    expect(compareDecimals('-2', '1')).toBe(-1);
    expect(compareDecimals('10', '9.999')).toBe(1);
    expect(negateDecimal('8.50')).toBe('-8.50');
    expect(negateDecimal('0.00')).toBe('0.00');
    expect(trimDecimal('3.000')).toBe('3');
    expect(trimDecimal('1.500')).toBe('1.5');
    expect(trimDecimal('-0.00')).toBe('0');
    expect(toMoneyString('7')).toBe('7.00');
  });

  it('converts UI numbers with bounded precision', () => {
    expect(numberToDecimalString(0.1 + 0.2)).toBe('0.3');
    expect(numberToDecimalString(2)).toBe('2');
    expect(() => numberToDecimalString(Number.NaN)).toThrow(DecimalError);
  });
});
