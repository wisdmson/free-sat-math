import { describe, expect, it } from 'vitest';
import { mathSegments, paragraphs, splitMath } from '../../src/engine/markup';

describe('splitMath', () => {
  it('splits inline and display math from text', () => {
    expect(splitMath('Solve $x + 1 = 2$ now.')).toEqual([
      { kind: 'text', value: 'Solve ' },
      { kind: 'math', value: 'x + 1 = 2', display: false },
      { kind: 'text', value: ' now.' },
    ]);
    expect(splitMath('$$y = 2x$$')).toEqual([{ kind: 'math', value: 'y = 2x', display: true }]);
  });

  it('treats \\$ as a literal dollar in text', () => {
    expect(splitMath('costs \\$12 each')).toEqual([{ kind: 'text', value: 'costs $12 each' }]);
  });

  it('keeps escaped dollars inside math', () => {
    expect(splitMath('$\\$5$')).toEqual([{ kind: 'math', value: '\\$5', display: false }]);
  });

  it('throws on unclosed math', () => {
    expect(() => splitMath('oops $x + 1')).toThrow(SyntaxError);
  });

  it('lists math segments', () => {
    expect(mathSegments('a $x$ b $$y$$')).toEqual(['x', 'y']);
  });
});

describe('paragraphs', () => {
  it('splits on blank lines and trims', () => {
    expect(paragraphs('one\n\n  two  \n\n\n')).toEqual(['one', 'two']);
  });
});
