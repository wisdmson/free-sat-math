import { describe, expect, it } from 'vitest';
import { formatMentalAnswer } from '../../src/engine/mental/format';
import type { MentalAnswer } from '../../src/engine/mental/types';

const num = (
  value: string,
  extra: Partial<Extract<MentalAnswer, { kind: 'number' }>> = {},
): MentalAnswer => ({
  kind: 'number',
  value,
  ...extra,
});

describe('formatMentalAnswer', () => {
  it('writes the answer in the form the question asked for', () => {
    expect(formatMentalAnswer(num('1/4', { form: 'decimal' }))).toBe('0.25');
    expect(formatMentalAnswer(num('5/4', { form: 'fraction' }))).toBe('5/4');
    expect(formatMentalAnswer(num('175/2', { suffix: '%' }))).toBe('87.5%');
    expect(formatMentalAnswer(num('282/5', { suffix: '%' }))).toBe('56.4%');
  });
  it('uses decimals when they end, fractions when they repeat, and a real minus sign', () => {
    expect(formatMentalAnswer(num('-13'))).toBe('−13');
    expect(formatMentalAnswer(num('3/2'))).toBe('1.5');
    expect(formatMentalAnswer(num('-1/8'))).toBe('−0.125');
    expect(formatMentalAnswer(num('1/3'))).toBe('1/3');
  });
  it('shows the right choice for choice questions', () => {
    expect(formatMentalAnswer({ kind: 'choice', choices: ['a', 'b', 'c', 'd'], index: 2 })).toBe(
      'c',
    );
  });
});
