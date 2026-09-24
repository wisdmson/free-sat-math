import { linear, system, tex } from '../../format';
import type { Difficulty, Format, GeneratedBody, Problem, ProblemType } from '../../problem';
import { Rational, r } from '../../rational';
import type { Rng } from '../../rng';
import {
  answerValue,
  fallbackCandidates,
  fixedChoices,
  numericAnswer,
  pickDistractors,
  type Candidate,
} from '../shared/choices';
import { eqFromMeta, eqTex, eqToMeta, lin, scaleEq, solve2, type LinEq } from '../shared/linear2';
import { nonZeroInt } from '../shared/numbers';

type Outcome = 'zero' | 'one' | 'infinite';
type CountKey = Outcome | 'two';

/** Choices in counting order: zero < one < two < infinitely many. */
const COUNT_CHOICES: ReadonlyArray<{ key: CountKey; text: string }> = [
  { key: 'zero', text: 'Zero' },
  { key: 'one', text: 'Exactly one' },
  { key: 'two', text: 'Exactly two' },
  { key: 'infinite', text: 'Infinitely many' },
];

const WHY_WRONG: Record<Outcome, Record<CountKey, string>> = {
  zero: {
    zero: '',
    one: 'The slopes are equal, so the lines are parallel; lines with equal slopes and different intercepts never cross.',
    two: 'Two different lines cross at most once, so a linear system never has exactly two solutions.',
    infinite:
      'Equal slopes are not enough: the intercepts differ, so the lines are parallel and never meet.',
  },
  one: {
    zero: 'The slopes are different, so the lines must cross exactly once.',
    one: '',
    two: 'Two different lines cross at most once, so a linear system never has exactly two solutions.',
    infinite: 'The slopes differ, so these are two different lines that cross exactly once.',
  },
  infinite: {
    zero: 'Both equations describe the same line, so every point on that line is a solution.',
    one: 'The slopes are equal and so are the intercepts: both equations describe the same line.',
    two: 'Two different lines cross at most once, and here the lines are the same line.',
    infinite: '',
  },
};

const classify = (e1: LinEq, e2: LinEq): Outcome => {
  const kind = solve2(e1, e2).kind;
  return kind === 'one' ? 'one' : kind === 'none' ? 'zero' : 'infinite';
};

function countBody(
  stemSystem: string,
  e1: LinEq,
  e2: LinEq,
  outcome: Outcome,
  solution: string[],
): GeneratedBody {
  const built = fixedChoices(
    COUNT_CHOICES.map((c) => ({
      text: c.text,
      value: c.key,
      note: c.key === outcome ? null : WHY_WRONG[outcome][c.key],
    })),
  );
  return {
    stem: `$$${stemSystem}$$\n\nHow many solutions does the given system of equations have?`,
    ...built,
    solution,
    desmos: [eqTex(e1), eqTex(e2)],
    meta: { mode: 'count', e1: eqToMeta(e1), e2: eqToMeta(e2), outcome },
  };
}

/** Easy: both lines in slope-intercept form (the same-line case is disguised by a multiple). */
function easy(rng: Rng): GeneratedBody {
  const outcome: Outcome = rng.pick(['zero', 'one', 'infinite'] as const);
  const m1 = nonZeroInt(rng, -5, 5);
  const k1 = rng.int(-9, 9);
  const first = linear([[m1, 'x']], k1);
  const e1 = lin(-m1, 1, k1);

  if (outcome === 'infinite') {
    const n = rng.pick([2, 3, -2, -3]);
    const e2 = lin(-n * m1, n, n * k1);
    return countBody(
      system([
        ['y', first],
        [linear([[n, 'y']]), linear([[n * m1, 'x']], n * k1)],
      ]),
      e1,
      e2,
      outcome,
      [
        `Divide both sides of the second equation by $${tex(n)}$: $y = ${first}$.`,
        'That is the first equation, so both equations describe the same line. Every point on the line is a solution, so there are infinitely many solutions.',
      ],
    );
  }

  let m2 = m1;
  let k2 = k1;
  if (outcome === 'zero') {
    k2 = k1 + nonZeroInt(rng, -6, 6);
  } else {
    while (m2 === m1) m2 = nonZeroInt(rng, -5, 5);
    k2 = rng.int(-9, 9);
  }
  const second = linear([[m2, 'x']], k2);
  const e2 = lin(-m2, 1, k2);
  const solution =
    outcome === 'zero'
      ? [
          `Both equations are in slope-intercept form, and both lines have slope $${tex(m1)}$.`,
          `The $y$-intercepts are different ($${tex(k1)}$ and $${tex(k2)}$), so the lines are parallel and never meet. The system has zero solutions.`,
        ]
      : [
          `The first line has slope $${tex(m1)}$ and the second has slope $${tex(m2)}$.`,
          'Lines with different slopes cross at exactly one point, so the system has exactly one solution.',
        ];
  return countBody(
    system([
      ['y', first],
      ['y', second],
    ]),
    e1,
    e2,
    outcome,
    solution,
  );
}

/** Medium: standard form, where one equation may be a multiple of the other. */
function medium(rng: Rng): GeneratedBody {
  const outcome: Outcome = rng.pick(['zero', 'one', 'infinite'] as const);
  const p = rng.int(1, 6);
  const q = nonZeroInt(rng, -6, 6);
  const c = rng.int(-9, 9);
  const n = rng.pick([2, 3, 4, -2, -3]);
  const e1 = lin(p, q, c);
  const scaled = scaleEq(e1, n);

  let e2: LinEq;
  let solution: string[];
  if (outcome === 'zero') {
    e2 = lin(n * p, n * q, n * c + nonZeroInt(rng, -5, 5));
    solution = [
      `Multiply the first equation by $${tex(n)}$: $${eqTex(scaled)}$.`,
      `The left side now matches the second equation, but the right sides differ ($${tex(n * c)}$ and $${tex(e2.c)}$). The lines are parallel, so the system has zero solutions.`,
    ];
  } else if (outcome === 'infinite') {
    e2 = scaled;
    solution = [
      `Multiply the first equation by $${tex(n)}$: $${eqTex(scaled)}$.`,
      'That is exactly the second equation, so both equations describe the same line. The system has infinitely many solutions.',
    ];
  } else {
    e2 = lin(n * p + nonZeroInt(rng, -3, 3), n * q, rng.int(-12, 12));
    const slope1 = e1.a.neg().div(e1.b);
    const slope2 = e2.a.neg().div(e2.b);
    solution = [
      `Solve each equation for $y$. The first line has slope $${tex(slope1)}$ and the second has slope $${tex(slope2)}$.`,
      'The slopes are different, so the lines cross exactly once. The system has exactly one solution.',
    ];
  }
  return countBody(
    system([
      [
        linear([
          [e1.a, 'x'],
          [e1.b, 'y'],
        ]),
        tex(e1.c),
      ],
      [
        linear([
          [e2.a, 'x'],
          [e2.b, 'y'],
        ]),
        tex(e2.c),
      ],
    ]),
    e1,
    e2,
    outcome,
    solution,
  );
}

/** Hard: find the constant k that gives no solution or infinitely many solutions. */
function hard(rng: Rng, format: Format): GeneratedBody {
  const cond: 'none' | 'infinite' = rng.pick(['none', 'infinite'] as const);
  const hidden: 'x' | 'y' = rng.pick(['x', 'y'] as const);
  const p = rng.int(1, 6);
  const q = nonZeroInt(rng, -6, 6);
  const c = nonZeroInt(rng, -9, 9);
  const m1 = rng.int(1, 3);
  let m2 = m1;
  while (m2 === m1) m2 = rng.int(2, 5);
  const delta = cond === 'none' ? nonZeroInt(rng, -5, 5) : 0;

  const e1 = lin(m1 * p, m1 * q, m1 * c);
  const e2 = lin(m2 * p, m2 * q, m2 * c + delta);
  const k = hidden === 'x' ? e1.a : e1.b;
  const known1 = hidden === 'x' ? e1.b : e1.a;
  const known2 = hidden === 'x' ? e2.b : e2.a;
  const other2 = hidden === 'x' ? e2.a : e2.b;
  const ratio = known2.div(known1);
  const knownVar = hidden === 'x' ? 'y' : 'x';
  const reduces = !(ratio.num === known2.num && ratio.den === known1.num);

  const firstLhs =
    hidden === 'x'
      ? linear([
          [1, 'kx'],
          [e1.b, 'y'],
        ])
      : linear([
          [e1.a, 'x'],
          [1, 'ky'],
        ]);
  const stemSystem = system([
    [firstLhs, tex(e1.c)],
    [
      linear([
        [e2.a, 'x'],
        [e2.b, 'y'],
      ]),
      tex(e2.c),
    ],
  ]);
  const solution = [
    cond === 'none'
      ? 'A linear system has no solution when its lines are parallel: the $x$-coefficients and the $y$-coefficients are in the same ratio, but the constants are not.'
      : 'A linear system has infinitely many solutions when one equation is a multiple of the other: the $x$-coefficients, the $y$-coefficients, and the constants are all in the same ratio.',
    `Compare the known $${knownVar}$-coefficients: $\\frac{${tex(known2)}}{${tex(known1)}}${reduces ? ` = ${tex(ratio)}` : ''}$.`,
    `The $${hidden}$-coefficients need the same ratio: $\\frac{${tex(other2)}}{k} = ${tex(ratio)}$, so $k = ${tex(k)}$.`,
    cond === 'none'
      ? `Check the constants: $\\frac{${tex(e2.c)}}{${tex(e1.c)}} \\neq ${tex(ratio)}$, so the lines are parallel rather than the same line.`
      : `Check the constants: $\\frac{${tex(e2.c)}}{${tex(e1.c)}} = ${tex(ratio)}$ as well, so the equations describe the same line.`,
  ];

  const distractors = (): Candidate[] =>
    pickDistractors(k, [
      {
        value: other2,
        note: 'This is the matching coefficient in the other equation. The coefficients need the same ratio, not the same value.',
      },
      {
        value: other2.mul(ratio),
        note: 'The ratio is flipped: scale by the first equation over the second, not the second over the first.',
      },
      ...(e2.c.isZero()
        ? []
        : [
            {
              value: other2.mul(e1.c.div(e2.c)),
              note: 'Used the ratio of the constants instead of the ratio of the known coefficients.',
            },
          ]),
      ...fallbackCandidates(k, rng),
    ]);

  return {
    stem: `$$${stemSystem}$$\n\nIn the given system of equations, $k$ is a constant. If the system has ${cond === 'none' ? 'no solution' : 'infinitely many solutions'}, what is the value of $k$?`,
    ...numericAnswer(format, k, distractors),
    solution,
    meta: { mode: 'constant', e1: eqToMeta(e1), e2: eqToMeta(e2), hidden, cond },
  };
}

export const systemsCount: ProblemType = {
  id: 'alg.systems.solution-count',
  version: 1,
  skill: 'alg.systems',
  supports: { easy: ['mcq'], medium: ['mcq'], hard: ['mcq', 'spr'] },
  generate(rng: Rng, difficulty: Difficulty, format: Format): GeneratedBody {
    if (difficulty === 'easy') return easy(rng);
    if (difficulty === 'medium') return medium(rng);
    return hard(rng, format);
  },
  verify(problem: Problem): boolean {
    const meta = problem.meta ?? {};
    const e1 = eqFromMeta(meta['e1']);
    const e2 = eqFromMeta(meta['e2']);
    const given = answerValue(problem);
    if (given === null) return false;
    if (meta['mode'] === 'count') {
      return classify(e1, e2) === meta['outcome'] && given === meta['outcome'];
    }
    const want = meta['cond'] === 'none' ? 'zero' : 'infinite';
    const k = Rational.parse(given);
    const withK = (value: Rational): LinEq =>
      meta['hidden'] === 'x' ? lin(value, e1.b, e1.c) : lin(e1.a, value, e1.c);
    return classify(withK(k), e2) === want && classify(withK(k.add(r(1))), e2) === 'one';
  },
};
