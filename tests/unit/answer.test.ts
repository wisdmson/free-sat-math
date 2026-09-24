import { describe, expect, it } from 'vitest';
import {
  acceptedDecimals,
  checkSpr,
  isEnterable,
  parseSpr,
  sanitizeSprTyping,
  type SprAnswer,
} from '../../src/engine/answer';
import { r } from '../../src/engine/rational';

const values = (...v: string[]): SprAnswer => ({ kind: 'values', values: v });
const correct = (a: SprAnswer, input: string) => checkSpr(a, input);

describe('parseSpr', () => {
  it('accepts integers, fractions and decimals within the length cap', () => {
    expect(parseSpr('3/4')?.toString()).toBe('3/4');
    expect(parseSpr('.75')?.toString()).toBe('3/4');
    expect(parseSpr('-2/3')?.toString()).toBe('-2/3');
    expect(parseSpr('-.6667')?.toString()).toBe('-6667/10000');
    expect(parseSpr('3.')?.toString()).toBe('3');
    expect(parseSpr('-0.5')?.toString()).toBe('-1/2');
    expect(parseSpr('06/8')?.toString()).toBe('3/4');
  });
  it('rejects symbols, mixed numbers and over-long entries', () => {
    for (const bad of [
      '3 1/2',
      '$5',
      '50%',
      '1,000',
      '123456',
      '-1234567',
      '',
      '1/0',
      '--1',
      '1/-2',
    ]) {
      expect(parseSpr(bad), bad).toBeNull();
    }
  });
});

describe('sanitizeSprTyping', () => {
  it('strips disallowed characters and caps length', () => {
    expect(sanitizeSprTyping('$1,2a')).toBe('12');
    expect(sanitizeSprTyping('123456')).toBe('12345');
    expect(sanitizeSprTyping('-123456')).toBe('-12345');
    expect(sanitizeSprTyping('3-4')).toBe('34');
  });
});

describe('checkSpr exact values', () => {
  it('accepts every equivalent form of 3/4', () => {
    for (const input of ['3/4', '6/8', '.75', '0.75']) {
      expect(correct(values('3/4'), input), input).toEqual({ status: 'checked', correct: true });
    }
  });
  it('marks wrong values wrong', () => {
    expect(correct(values('3/4'), '.7')).toEqual({ status: 'checked', correct: false });
  });
  it('returns invalid with a hint for bad input', () => {
    expect(correct(values('3/4'), '3 1/2')).toMatchObject({ status: 'invalid' });
  });
  it('accepts any of several listed values', () => {
    expect(correct(values('2', '-5'), '-5')).toEqual({ status: 'checked', correct: true });
  });
});

describe('checkSpr non-terminating values', () => {
  it('accepts 2/3 only in full-length truncated or rounded form', () => {
    for (const ok of ['2/3', '4/6', '.6666', '.6667', '0.666', '0.667']) {
      expect(correct(values('2/3'), ok), ok).toEqual({ status: 'checked', correct: true });
    }
    for (const no of ['.66', '.67', '0.67', '0.6']) {
      expect(correct(values('2/3'), no), no).toEqual({ status: 'checked', correct: false });
    }
  });
  it('handles negatives', () => {
    for (const ok of ['-2/3', '-.6666', '-.6667', '-0.666', '-0.667']) {
      expect(correct(values('-2/3'), ok), ok).toEqual({ status: 'checked', correct: true });
    }
    expect(correct(values('-2/3'), '-.67')).toEqual({ status: 'checked', correct: false });
  });
});

describe('acceptedDecimals', () => {
  it('matches the worked examples', () => {
    expect(acceptedDecimals(r(2, 3)).sort()).toEqual(['.6666', '.6667', '0.666', '0.667'].sort());
    expect(acceptedDecimals(r(10, 3))).toEqual(['3.333']);
    expect(acceptedDecimals(r(1, 7)).sort()).toEqual(['.1428', '.1429', '0.142', '0.143'].sort());
    expect(acceptedDecimals(r(200, 3)).sort()).toEqual(['66.66', '66.67']);
    expect(acceptedDecimals(r(100000, 3))).toEqual([]);
  });
});

describe('checkSpr intervals', () => {
  const band: SprAnswer = {
    kind: 'interval',
    min: '2',
    max: '5/2',
    minInclusive: false,
    maxInclusive: true,
  };
  it('respects the endpoints', () => {
    expect(correct(band, '2')).toEqual({ status: 'checked', correct: false });
    expect(correct(band, '2.1')).toEqual({ status: 'checked', correct: true });
    expect(correct(band, '5/2')).toEqual({ status: 'checked', correct: true });
    expect(correct(band, '2.51')).toEqual({ status: 'checked', correct: false });
  });
});

describe('isEnterable', () => {
  it('knows what fits in the answer box', () => {
    expect(isEnterable(r(7, 2))).toBe(true);
    expect(isEnterable(r(-1234))).toBe(true);
    expect(isEnterable(r(123456))).toBe(false);
    expect(isEnterable(r(1, 32))).toBe(true);
    expect(isEnterable(r(2, 3))).toBe(true);
    expect(isEnterable(r(100000, 3))).toBe(false);
  });
});
