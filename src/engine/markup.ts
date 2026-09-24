/**
 * Splits problem text into plain-text and math segments.
 * - `$...$` is inline math, `$$...$$` is display math.
 * - `\$` is a literal dollar sign in text (used for money).
 * - A blank line separates paragraphs.
 */
export type Segment =
  { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean };

export function splitMath(source: string): Segment[] {
  const out: Segment[] = [];
  let text = '';
  let i = 0;
  const flushText = () => {
    if (text !== '') out.push({ kind: 'text', value: text });
    text = '';
  };
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\' && source[i + 1] === '$') {
      text += '$';
      i += 2;
      continue;
    }
    if (ch === '$') {
      const display = source[i + 1] === '$';
      const open = display ? 2 : 1;
      const close = findClose(source, i + open, display);
      if (close === -1)
        throw new SyntaxError(`Unclosed math starting at ${i}: ${source.slice(i, i + 30)}`);
      flushText();
      out.push({ kind: 'math', value: source.slice(i + open, close), display });
      i = close + open;
      continue;
    }
    text += ch;
    i++;
  }
  flushText();
  return out;
}

function findClose(source: string, from: number, display: boolean): number {
  for (let j = from; j < source.length; j++) {
    if (source[j] === '\\') {
      j++;
      continue;
    }
    if (source[j] === '$') {
      if (!display) return j;
      if (source[j + 1] === '$') return j;
    }
  }
  return -1;
}

/** Paragraphs of a text: split on blank lines, trimmed, empties dropped. */
export function paragraphs(source: string): string[] {
  return source
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

/** Every math segment in a text (used by tests and lint). */
export function mathSegments(source: string): string[] {
  return splitMath(source).flatMap((s) => (s.kind === 'math' ? [s.value] : []));
}
