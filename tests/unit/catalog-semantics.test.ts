/**
 * An independent answer check for the 18 catalog question types: each answer is worked out
 * again from the question TEXT the student sees (never from generator internals), over many
 * seeds. This is the check that catches a generator and its verify() sharing the same mistake.
 */
import { describe, expect, it } from 'vitest';
import { buildProblem } from '../../src/engine/build';
import { answerValue } from '../../src/engine/generators/shared/choices';
import { CATALOG_TYPES } from '../../src/engine/generators/catalog';
import { DIFFICULTIES } from '../../src/engine/problem';
import { Rational, r } from '../../src/engine/rational';

const SEEDS = 300;

/** A TeX number: "-12", "1{,}200", "\frac{3}{4}", "-\frac{3}{4}". */
function num(s: string): Rational {
  const t = s.replace(/\{,\}/g, '').trim();
  const f = /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(t);
  if (f) return r((f[1] === '-' ? -1 : 1) * Number(f[2]), Number(f[3]));
  if (!/^-?\d+$/.test(t)) throw new Error(`not a number: ${s}`);
  return r(Number(t));
}

/** "3x + 9", "-x - 4", "2x" → [a, b] for ax + b. */
function lin(s: string): [Rational, Rational] {
  const m = /^(-?)(\d*)x(?: ([+-]) (\S+))?$/.exec(s.trim());
  if (!m) throw new Error(`not a linear expression: ${s}`);
  const a = r((m[1] === '-' ? -1 : 1) * (m[2] === '' ? 1 : Number(m[2])));
  const b = m[3] === undefined ? r(0) : num(m[4] as string).mul(r(m[3] === '-' ? -1 : 1));
  return [a, b];
}

const need = (re: RegExp, s: string): RegExpExecArray => {
  const m = re.exec(s);
  if (!m) throw new Error(`stem not understood: ${s}`);
  return m;
};

/** The right answer, worked out from what the question says. */
const fromStem: Record<string, (stem: string) => Rational | string> = {
  'alg.linear-one-var.solve': (s) => {
    const m = need(/Solve for \$x\$: \$(.+) = (.+)\$\.$/, s);
    const [a, b] = lin(m[1] as string);
    return num(m[2] as string)
      .sub(b)
      .div(a);
  },
  'alg.linear-functions.slope-intercept': (s) => {
    const m = need(/f\(x\) = (.+)\$\. What is \$f\((-?\d+)\)\$\?$/, s);
    const [a, b] = lin(m[1] as string);
    return a.mul(r(Number(m[2]))).add(b);
  },
  'alg.linear-two-var.line-equation': (s) => {
    const m = need(/\$y = (.+)\$\. What is the \$y\$-coordinate when \$x = (-?\d+)\$\?$/, s);
    const [a, b] = lin(m[1] as string);
    return a.mul(r(Number(m[2]))).add(b);
  },
  'alg.inequalities.solve': (s) => {
    const m = need(/solution to \$(.+) < (.+)\$\?$/, s);
    const [a, b] = lin(m[1] as string);
    expect(a.sign()).toBe(1);
    const t = num(m[2] as string)
      .sub(b)
      .div(a)
      .toNumber(); // x < t
    return r(Math.ceil(t) - 1);
  },
  'adv.equivalent-expressions.expand-simplify': (s) => {
    const m = need(/When \$(-?\d*)x\((.+)\) ([+-]) (\d*)x\$ is written/, s);
    const a = r(Number(m[1] === '' ? 1 : m[1] === '-' ? -1 : m[1]));
    const [, b] = lin(m[2] as string);
    const c = r((m[3] === '-' ? -1 : 1) * Number(m[4] === '' ? 1 : m[4]));
    return a.mul(b).add(c);
  },
  'adv.nonlinear-equations.quadratic-solve': (s) => {
    const m = need(/\$\(x ([+-]) (\d+)\)\(x ([+-]) (\d+)\) = 0\$/, s);
    const root1 = (m[1] === '-' ? 1 : -1) * Number(m[2]);
    const root2 = (m[3] === '-' ? 1 : -1) * Number(m[4]);
    return r(Math.max(root1, root2));
  },
  'adv.nonlinear-functions.vertex-form': (s) => {
    const m = need(
      /f\(x\) = (-?\d*)\(x ([+-]) (\d+)\)\^2 ([+-]) (\d+)\$\. What is \$f\((-?\d+)\)\$/,
      s,
    );
    const a = Number(m[1] === '' ? 1 : m[1] === '-' ? -1 : m[1]);
    const h = (m[2] === '-' ? 1 : -1) * Number(m[3]);
    const k = (m[4] === '-' ? -1 : 1) * Number(m[5]);
    const x = Number(m[6]);
    return r(a * (x - h) ** 2 + k);
  },
  'psda.ratios-rates.proportional-rate': (s) => {
    const m = need(/makes \$(\d+)\$ pages in \$(\d+)\$ minutes.* in \$(\d+)\$ minutes\?$/, s);
    return r(Number(m[1]))
      .div(r(Number(m[2])))
      .mul(r(Number(m[3])));
  },
  'psda.percentages.percent-basic': (s) => {
    const m = need(/A value of \$(\d+)\$ increases by \$(\d+)\\%\$/, s);
    return r(Number(m[1])).mul(r(100 + Number(m[2]), 100));
  },
  'psda.one-var-data.center-spread': (s) => {
    const m = need(/The data set is \$([\d, ]+)\$\. What is its mean\?$/, s);
    const xs = (m[1] as string).split(',').map((v) => Number(v.trim()));
    return r(
      xs.reduce((sum, v) => sum + v, 0),
      xs.length,
    );
  },
  'psda.two-var-data.best-fit-read': (s) => {
    const m = need(/\$y = (.+)\$\. Use this model to predict \$y\$ when \$x = (-?\d+)\$\.$/, s);
    const [a, b] = lin(m[1] as string);
    return a.mul(r(Number(m[2]))).add(b);
  },
  'psda.probability.two-way-table': (s) => {
    const m = need(/contains (\d+) red tokens and (\d+) blue tokens/, s);
    const red = Number(m[1]);
    return r(red, red + Number(m[2]));
  },
  'psda.inference.sample-margin': (s) => {
    const m = need(/\$(\d+)\$ out of \$100\$ .* margin of error is \$(\d+)\$ percentage points/, s);
    expect(s).toMatch(/as a percent/);
    return r(Number(m[1]) - Number(m[2]));
  },
  'psda.claims.evaluate-study': () => 'randomized',
  'geo.area-volume.solid-volume': (s) => {
    const m = need(/is \$(\d+)\$ units long, \$(\d+)\$ units wide, and \$(\d+)\$ units tall/, s);
    return r(Number(m[1]) * Number(m[2]) * Number(m[3]));
  },
  'geo.lines-angles-triangles.triangle-angle-sum': (s) => {
    const m = need(/measure \$(\d+)\^\\circ\$ and \$(\d+)\^\\circ\$/, s);
    return r(180 - Number(m[1]) - Number(m[2]));
  },
  'geo.right-triangles-trig.pythagorean': (s) => {
    const m = need(/legs measuring \$(\d+)\$ and \$(\d+)\$ units/, s);
    const c = Math.sqrt(Number(m[1]) ** 2 + Number(m[2]) ** 2);
    expect(Number.isInteger(c)).toBe(true);
    return r(c);
  },
  'geo.circles.circle-equation': (s) => {
    const m = need(/\)\^2 = (\d+)\$\. What is its radius\?$/, s);
    const rad = Math.sqrt(Number(m[1]));
    expect(Number.isInteger(rad)).toBe(true);
    return r(rad);
  },
};

/** Quantities that can't be negative: no negative answer choices. */
const NEVER_NEGATIVE = new Set([
  'psda.ratios-rates.proportional-rate',
  'psda.percentages.percent-basic',
  'psda.probability.two-way-table',
  'psda.inference.sample-margin',
  'geo.area-volume.solid-volume',
  'geo.lines-angles-triangles.triangle-angle-sum',
  'geo.right-triangles-trig.pythagorean',
  'geo.circles.circle-equation',
]);

function* problems(typeId: string) {
  const t = CATALOG_TYPES.find((x) => x.id === typeId)!;
  for (const d of DIFFICULTIES)
    for (const format of t.supports[d])
      for (let seed = 1; seed <= SEEDS; seed++) yield buildProblem(t, d, format, seed);
}

describe.each(CATALOG_TYPES.map((t) => [t.id] as const))('%s', (id) => {
  it('marks the answer the question text actually asks for', () => {
    const wrong: string[] = [];
    for (const p of problems(id)) {
      const expected = (fromStem[id] as (s: string) => Rational | string)(p.stem);
      const recorded = answerValue(p);
      const ok =
        typeof expected === 'string'
          ? recorded === expected
          : recorded !== null && Rational.parse(recorded).eq(expected);
      if (!ok) wrong.push(`${p.stem} → recorded ${recorded}, should be ${expected.toString()}`);
    }
    expect([...new Set(wrong)].slice(0, 3)).toEqual([]);
  });

  it('has no display glitches in its text', () => {
    for (const p of problems(id)) {
      for (const line of [p.stem, ...p.solution]) {
        expect(line, line).not.toMatch(/\t/);
        expect(line, line).not.toMatch(/(^|[^\\a-z])(div|imes)\b/);
      }
    }
  });

  it('does not give the answer away by its position', () => {
    const letters = [0, 0, 0, 0];
    let n = 0;
    for (const p of problems(id)) {
      if (p.answer.kind !== 'choice') continue;
      letters[p.answer.index] = (letters[p.answer.index] ?? 0) + 1;
      n++;
    }
    if (n === 0) return;
    expect(Math.max(...letters) / n, `answer letters ${letters.join('/')}`).toBeLessThan(0.5);
  });

  it.runIf(NEVER_NEGATIVE.has(id))(
    'offers no negative choices for a quantity that cannot be negative',
    () => {
      for (const p of problems(id)) {
        for (const c of p.choices ?? [])
          expect(c.value === undefined || !c.value.startsWith('-'), `${p.stem}: ${c.text}`).toBe(
            true,
          );
      }
    },
  );
});
