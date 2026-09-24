import katex from 'katex';
import { isEnterable } from '../../src/engine/answer';
import { lintMath } from '../../src/engine/format';
import { splitMath } from '../../src/engine/markup';
import { LETTERS, type Problem } from '../../src/engine/problem';
import { Rational } from '../../src/engine/rational';

const renderedOk = new Set<string>();
const BAD_TEXT = /NaN|undefined|Infinity|\bnull\b|\[object/;

function textIssues(label: string, source: string): string[] {
  let segments;
  try {
    segments = splitMath(source);
  } catch (err) {
    return [`${label}: ${(err as Error).message}`];
  }
  const issues: string[] = [];
  for (const seg of segments) {
    if (seg.kind === 'text') {
      if (BAD_TEXT.test(seg.value)) issues.push(`${label}: bad text "${seg.value}"`);
      continue;
    }
    issues.push(...lintMath(seg.value).map((m) => `${label}: ${m}`));
    const key = `${seg.display ? 'D' : 'I'}${seg.value}`;
    if (renderedOk.has(key)) continue;
    try {
      katex.renderToString(seg.value, {
        throwOnError: true,
        displayMode: seg.display,
        strict: 'error',
      });
      renderedOk.add(key);
    } catch (err) {
      issues.push(`${label}: KaTeX ${(err as Error).message}`);
    }
  }
  return issues;
}

/** Everything wrong with a problem's shape and rendering. An empty array means it passes. */
export function problemIssues(p: Problem): string[] {
  const issues: string[] = [];
  if (p.stem.trim() === '') issues.push('empty stem');
  if (p.solution.length === 0) issues.push('no solution steps');
  issues.push(...textIssues('stem', p.stem));
  p.solution.forEach((step, i) => issues.push(...textIssues(`solution[${i}]`, step)));

  if (p.format === 'mcq') {
    if (p.answer.kind !== 'choice') issues.push('mcq without a choice answer');
    const choices = p.choices ?? [];
    if (choices.length !== 4) issues.push(`expected 4 choices, got ${choices.length}`);
    if (new Set(choices.map((c) => c.text)).size !== choices.length)
      issues.push('duplicate choice text');
    const values = choices.flatMap((c) => (c.value === undefined ? [] : [c.value]));
    if (new Set(values).size !== values.length) issues.push('duplicate choice values');
    choices.forEach((c, i) => issues.push(...textIssues(`choice ${LETTERS[i]}`, c.text)));
    if (p.answer.kind === 'choice') {
      const wrong = LETTERS.filter((_, i) => i !== (p.answer as { index: number }).index);
      const noted = Object.keys(p.distractorNotes ?? {}).sort();
      if (noted.join() !== [...wrong].sort().join())
        issues.push(`distractor notes for ${noted} but wrong choices are ${wrong}`);
    }
    for (const [letter, note] of Object.entries(p.distractorNotes ?? {})) {
      issues.push(...textIssues(`note ${letter}`, note));
    }
  } else {
    if (p.answer.kind === 'choice') issues.push('spr with a choice answer');
    if (p.choices !== undefined) issues.push('spr with choices');
    if (p.answer.kind === 'values') {
      if (p.answer.values.length === 0) issues.push('spr with no accepted values');
      for (const v of p.answer.values) {
        try {
          if (!isEnterable(Rational.parse(v)))
            issues.push(`answer ${v} cannot be typed within the entry rules`);
        } catch {
          issues.push(`answer ${v} is not a number`);
        }
      }
    }
  }
  return issues;
}
