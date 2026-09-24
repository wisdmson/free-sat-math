import { commas, linear, signedGroup, system, tex } from '../../format';
import type { Difficulty, Format, GeneratedBody, Problem, ProblemType } from '../../problem';
import { Rational, r } from '../../rational';
import type { Rng } from '../../rng';
import {
  answerValue,
  fallbackCandidates,
  numericAnswer,
  pickDistractors,
  shuffledChoices,
  type Candidate,
} from '../shared/choices';
import { lin, solve2, type LinEq } from '../shared/linear2';
import { TWO_ITEM_SCENARIOS, type TwoItemScenario } from '../shared/scenarios';

const COUNTS = { integerOnly: true, min: 1 } as const;

/** "x + y = T; pA x + pB y = V" as a comparable key. */
const modelKey = (rows: ReadonlyArray<readonly [number, number, number]>): string =>
  rows.map((row) => row.join(',')).join(';');

const money = (n: number): string => `\\$${commas(n)}`;

function prices(rng: Rng, s: TwoItemScenario): [number, number] {
  return [rng.int(s.a.price[0], s.a.price[1]), rng.int(s.b.price[0], s.b.price[1])];
}

function salesSentence(
  s: TwoItemScenario,
  total: number,
  pA: number,
  pB: number,
  value: number,
): string {
  return `${s.seller} sold ${total} ${s.collective} in one day: some ${s.a.many} and the rest ${s.b.many}. Each ${s.a.one} cost ${money(pA)}, and each ${s.b.one} cost ${money(pB)}. Altogether the ${s.collective} brought in ${money(value)}.`;
}

/** Easy: choose the system of equations that models the sale. */
function easy(rng: Rng): GeneratedBody {
  const s = rng.pick(TWO_ITEM_SCENARIOS);
  const [pA, pB] = prices(rng, s);
  const nA = rng.int(s.count[0], s.count[1]);
  const nB = rng.int(s.count[0], s.count[1]);
  const T = nA + nB;
  const V = pA * nA + pB * nB;

  const option = (rows: ReadonlyArray<readonly [number, number, number]>) => ({
    text: `$${system(
      rows.map(
        ([a, b, c]) =>
          [
            linear([
              [a, 'x'],
              [b, 'y'],
            ]),
            tex(c),
          ] as const,
      ),
    )}$`,
    value: modelKey(rows),
  });
  const built = shuffledChoices(
    rng,
    option([
      [1, 1, T],
      [pA, pB, V],
    ]),
    [
      {
        ...option([
          [1, 1, V],
          [pA, pB, T],
        ]),
        note: `The number of ${s.collective} and the money collected are swapped.`,
      },
      {
        ...option([
          [1, 1, T],
          [pB, pA, V],
        ]),
        note: `The prices are on the wrong variables: $x$ counts ${s.a.many}, which cost ${money(pA)} each.`,
      },
      {
        ...option([
          [1, -1, T],
          [pA, pB, V],
        ]),
        note: `The number of ${s.a.many} plus the number of ${s.b.many} is the total, so the first equation should use $x + y$, not $x - y$.`,
      },
    ],
  );
  return {
    stem: `${salesSentence(s, T, pA, pB, V)}\n\nLet $x$ be the number of ${s.a.many} sold and $y$ the number of ${s.b.many} sold. Which system of equations represents this situation?`,
    ...built,
    solution: [
      `Each item sold counts once toward the ${T} ${s.collective}, so $x + y = ${tex(T)}$.`,
      `The ${s.a.many} bring in ${money(pA)} each and the ${s.b.many} bring in ${money(pB)} each, so $${linear(
        [
          [pA, 'x'],
          [pB, 'y'],
        ],
      )} = ${tex(V)}$.`,
    ],
    meta: { mode: 'model', T, V, pA, pB },
  };
}

/** Medium: total count and total money; find one of the counts. */
function medium(rng: Rng, format: Format): GeneratedBody {
  const s = rng.pick(TWO_ITEM_SCENARIOS);
  const [pA, pB] = prices(rng, s);
  const nA = rng.int(s.count[0], s.count[1]);
  const nB = rng.int(s.count[0], s.count[1]);
  const T = nA + nB;
  const V = pA * nA + pB * nB;
  const askA = rng.chance(0.5);
  const asked = askA ? s.a : s.b;
  const answer = r(askA ? nA : nB);

  const solution = [
    `Let $x$ be the number of ${s.a.many} and $y$ the number of ${s.b.many}. Then $x + y = ${tex(T)}$ and $${linear(
      [
        [pA, 'x'],
        [pB, 'y'],
      ],
    )} = ${tex(V)}$.`,
    `From the first equation, $y = ${tex(T)} - x$. Substitute into the second: $${linear([[pA, 'x']])} ${signedGroup(pB, `${tex(T)} - x`)} = ${tex(V)}$.`,
    `Simplify: $${linear([[pA - pB, 'x']], pB * T)} = ${tex(V)}$, so $${linear([[pA - pB, 'x']])} = ${tex(V - pB * T)}$ and $x = ${tex(nA)}$.`,
  ];
  if (!askA) solution.push(`Then $y = ${tex(T)} - ${tex(nA)} = ${tex(nB)}$.`);
  solution.push(`So ${askA ? nA : nB} ${asked.many} were sold.`);

  const otherCount = askA ? nB : nA;
  const otherItem = askA ? s.b : s.a;
  const distractors = (): Candidate[] =>
    pickDistractors(
      answer,
      [
        { value: r(otherCount), note: `This is the number of ${otherItem.many}.` },
        {
          value: r((askA ? pA : pB) * (askA ? nA : nB)),
          note: `This is the money from ${asked.many}, not the number sold.`,
        },
        { value: r(T, 2), note: 'This assumes the same number of each item was sold.' },
        {
          value: r(V, pA + pB),
          note: 'This divides the total money by the price of one of each item.',
        },
        ...fallbackCandidates(answer, rng),
      ],
      COUNTS,
    );

  return {
    stem: `${salesSentence(s, T, pA, pB, V)}\n\nHow many ${asked.many} were sold?`,
    ...numericAnswer(format, answer, distractors),
    solution,
    desmos: [`x + y = ${T}`, `${pA}x + ${pB}y = ${V}`],
    meta: { mode: 'count', T, V, pA, pB, ask: askA ? 'a' : 'b' },
  };
}

/** Hard: the counts are related ("d fewer than k times"), with no total count given. */
function hard(rng: Rng, format: Format): GeneratedBody {
  const s = rng.pick(TWO_ITEM_SCENARIOS);
  const [pA, pB] = prices(rng, s);
  const nA = rng.int(8, 40);
  const k = rng.int(2, 4);
  const d = rng.int(2, 15);
  const fewer = rng.chance(0.5);
  const sign = fewer ? -1 : 1;
  const nB = k * nA + sign * d;
  const V = pA * nA + pB * nB;
  const askA = rng.chance(0.5);
  const asked = askA ? s.a : s.b;
  const answer = r(askA ? nA : nB);
  const relation = linear([[k, 'x']], sign * d);

  const solution = [
    `Let $x$ be the number of ${s.a.many} and $y$ the number of ${s.b.many}. Then $y = ${relation}$ and $${linear(
      [
        [pA, 'x'],
        [pB, 'y'],
      ],
    )} = ${tex(V)}$.`,
    `Substitute for $y$: $${linear([[pA, 'x']])} ${signedGroup(pB, relation)} = ${tex(V)}$.`,
    `Simplify: $${linear([[pA + pB * k, 'x']], sign * pB * d)} = ${tex(V)}$, so $${linear([[pA + pB * k, 'x']])} = ${tex(V - sign * pB * d)}$ and $x = ${tex(nA)}$.`,
  ];
  if (!askA)
    solution.push(`Then $y = ${tex(k)}(${tex(nA)}) ${fewer ? '-' : '+'} ${tex(d)} = ${tex(nB)}$.`);
  solution.push(`So ${askA ? nA : nB} ${asked.many} were sold.`);

  const flippedX = r(V + sign * pB * d, pA + pB * k);
  const noKX = r(V - sign * pB * d, pA + pB);
  const readBackwards = `This reads "${d} ${fewer ? 'fewer' : 'more'} than" backwards.`;
  const distractors = (): Candidate[] =>
    askA
      ? pickDistractors(
          answer,
          [
            { value: r(nB), note: `This is the number of ${s.b.many}.` },
            { value: flippedX, note: readBackwards },
            {
              value: noKX,
              note: `This leaves out the factor of ${k} in the relationship between the counts.`,
            },
            ...fallbackCandidates(answer, rng),
          ],
          COUNTS,
        )
      : pickDistractors(
          answer,
          [
            { value: r(nA), note: `This is the number of ${s.a.many}.` },
            { value: flippedX.mul(r(k)).sub(r(sign * d)), note: readBackwards },
            { value: r(k * nA), note: `This forgets to ${fewer ? 'subtract' : 'add'} ${d}.` },
            ...fallbackCandidates(answer, rng),
          ],
          COUNTS,
        );

  return {
    stem: `${s.seller} sold ${s.a.many} for ${money(pA)} each and ${s.b.many} for ${money(pB)} each, bringing in a total of ${money(V)}. The number of ${s.b.many} sold was ${d} ${fewer ? 'fewer' : 'more'} than ${k} times the number of ${s.a.many} sold.\n\nHow many ${asked.many} were sold?`,
    ...numericAnswer(format, answer, distractors),
    solution,
    desmos: [`y = ${k}x ${fewer ? '-' : '+'} ${d}`, `${pA}x + ${pB}y = ${V}`],
    meta: { mode: 'relation', V, pA, pB, k, d, sign, ask: askA ? 'a' : 'b' },
  };
}

function positiveCounts(e1: LinEq, e2: LinEq): { x: Rational; y: Rational } | null {
  const sol = solve2(e1, e2);
  if (sol.kind !== 'one') return null;
  const ok = (v: Rational) => v.isInteger() && v.sign() > 0;
  return ok(sol.x) && ok(sol.y) ? { x: sol.x, y: sol.y } : null;
}

export const systemsWord: ProblemType = {
  id: 'alg.systems.word-system',
  version: 1,
  skill: 'alg.systems',
  supports: { easy: ['mcq'], medium: ['mcq', 'spr'], hard: ['mcq', 'spr'] },
  generate(rng: Rng, difficulty: Difficulty, format: Format): GeneratedBody {
    if (difficulty === 'easy') return easy(rng);
    if (difficulty === 'medium') return medium(rng, format);
    return hard(rng, format);
  },
  verify(problem: Problem): boolean {
    const m = problem.meta ?? {};
    const num = (key: string): number => {
      const v = m[key];
      if (typeof v !== 'number' || !Number.isInteger(v))
        throw new TypeError(`meta.${key} must be an integer`);
      return v;
    };
    const given = answerValue(problem);
    if (given === null) return false;
    if (m['mode'] === 'model') {
      const counts = positiveCounts(lin(1, 1, num('T')), lin(num('pA'), num('pB'), num('V')));
      return (
        counts !== null &&
        given ===
          modelKey([
            [1, 1, num('T')],
            [num('pA'), num('pB'), num('V')],
          ])
      );
    }
    const e1 =
      m['mode'] === 'count' ? lin(1, 1, num('T')) : lin(-num('k'), 1, num('sign') * num('d'));
    const counts = positiveCounts(e1, lin(num('pA'), num('pB'), num('V')));
    if (counts === null) return false;
    return Rational.parse(given).eq(m['ask'] === 'a' ? counts.x : counts.y);
  },
};
