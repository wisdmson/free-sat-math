import { describe, expect, it } from 'vitest';
import { buildMental, checkMental, mentalFromId } from '../../src/engine/mental/build';
import { getDrill } from '../../src/engine/mental/registry';
import type { MentalProblem } from '../../src/engine/mental/types';

const typed = (
  value: string,
  extra: Partial<Extract<MentalProblem['answer'], { kind: 'number' }>> = {},
): MentalProblem => ({
  id: 'm:test@1:1:1',
  drill: 'mm.fdp',
  tier: 1,
  prompt: 'test',
  answer: { kind: 'number', value, ...extra },
});

describe('checkMental', () => {
  it('accepts any exact form of the value', () => {
    expect(checkMental(typed('3/4'), '0.75')).toEqual({ status: 'checked', correct: true });
    expect(checkMental(typed('3/4'), '6/8')).toEqual({ status: 'checked', correct: true });
    expect(checkMental(typed('-13'), '−13')).toEqual({ status: 'checked', correct: true });
    expect(checkMental(typed('3/4'), '.7')).toEqual({ status: 'checked', correct: false });
  });
  it('asks for the requested form instead of marking it wrong', () => {
    expect(checkMental(typed('3/4', { form: 'decimal' }), '3/4').status).toBe('invalid');
    expect(checkMental(typed('5/4', { form: 'fraction' }), '1.25').status).toBe('invalid');
    expect(checkMental(typed('5/4', { form: 'fraction' }), '10/8')).toEqual({
      status: 'checked',
      correct: true,
    });
  });
  it('rejects things that are not numbers', () => {
    expect(checkMental(typed('3'), '')).toMatchObject({ status: 'invalid' });
    expect(checkMental(typed('3'), '1/0')).toMatchObject({ status: 'invalid' });
    expect(checkMental(typed('3'), '--3')).toMatchObject({ status: 'invalid' });
  });
});

describe('mentalFromId', () => {
  it('rebuilds a problem from its id', () => {
    const p = buildMental(getDrill('mm.percent')!, 2, 99);
    expect(mentalFromId(p.id)).toEqual(p);
    expect(mentalFromId('m:nope@1:1:1')).toBeNull();
  });
});
