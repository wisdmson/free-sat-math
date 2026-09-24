import { describe, expect, it } from 'vitest';
import { formatProblemId, parseProblemId } from '../../src/engine/problem';

describe('problem ids', () => {
  it('round-trips generated ids', () => {
    const id = 'g:alg.systems.solve-system@1:hard:mcq:48213';
    const ref = parseProblemId(id);
    expect(ref).toEqual({
      kind: 'generated',
      typeId: 'alg.systems.solve-system',
      version: 1,
      difficulty: 'hard',
      format: 'mcq',
      seed: 48213,
    });
    expect(formatProblemId(ref!)).toBe(id);
  });

  it('round-trips bank ids', () => {
    expect(parseProblemId('b:psda.claims-007')).toEqual({ kind: 'bank', slug: 'psda.claims-007' });
    expect(formatProblemId({ kind: 'bank', slug: 'psda.claims-007' })).toBe('b:psda.claims-007');
  });

  it('rejects malformed ids', () => {
    for (const bad of [
      '',
      'g:alg.systems.solve-system@1:extreme:mcq:1',
      'g:alg.systems.solve-system@1:hard:essay:1',
      'g:alg.systems.solve-system:hard:mcq:1',
      'g:alg.systems.solve-system@1:hard:mcq:4294967296',
      'b:',
      'b:Has Spaces',
      'x:whatever',
    ]) {
      expect(parseProblemId(bad), bad).toBeNull();
    }
  });
});
