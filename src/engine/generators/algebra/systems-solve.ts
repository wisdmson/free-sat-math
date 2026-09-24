import { linear, signedGroup, system, tex } from '../../format';
import type { Difficulty, Format, GeneratedBody, Problem, ProblemType } from '../../problem';
import { Rational, r } from '../../rational';
import type { Rng } from '../../rng';
import {
  answerValue,
  fallbackCandidates,
  numericAnswer,
  pickDistractors,
  type Candidate,
} from '../shared/choices';
import { eqFromMeta, eqTex, eqToMeta, lin, solve2, type LinEq } from '../shared/linear2';
import { nonZeroInt } from '../shared/numbers';

type Ask = 'x' | 'y' | 'x+y' | 'x-y';
const ASK_TEX: Record<Ask, string> = { x: 'x', y: 'y', 'x+y': 'x + y', 'x-y': 'x - y' };

function question(ask: Ask): string {
  return `The solution to the given system of equations is $(x, y)$. What is the value of $${ASK_TEX[ask]}$?`;
}

function body(
  format: Format,
  stemSystem: string,
  ask: Ask,
  answer: Rational,
  e1: LinEq,
  e2: LinEq,
  solution: string[],
  distractors: () => Candidate[],
): GeneratedBody {
  return {
    stem: `$$${stemSystem}$$\n\n${question(ask)}`,
    ...numericAnswer(format, answer, distractors),
    solution,
    desmos: [eqTex(e1), eqTex(e2)],
    meta: { e1: eqToMeta(e1), e2: eqToMeta(e2), ask },
  };
}

/** Easy: one equation already solved for y, so substitution is the natural move. */
function easy(rng: Rng, format: Format): GeneratedBody {
  const x0 = nonZeroInt(rng, -8, 8);
  const y0 = rng.int(-8, 8);
  const m = nonZeroInt(rng, -4, 4);
  const b = y0 - m * x0;
  const p = rng.int(1, 5);
  let q = nonZeroInt(rng, -5, 5);
  while (p + q * m === 0) q = nonZeroInt(rng, -5, 5);
  const c = p * x0 + q * y0;
  const k = p + q * m;
  const ask: Ask = rng.pick(['x', 'y'] as const);

  const slopeForm = linear([[m, 'x']], b);
  const e1 = lin(-m, 1, b);
  const e2 = lin(p, q, c);
  const solution = [
    `Substitute $y = ${slopeForm}$ into the second equation: $${linear([[p, 'x']])} ${signedGroup(q, slopeForm)} = ${tex(c)}$.`,
    `Distribute and combine like terms: $${linear([[k, 'x']], q * b)} = ${tex(c)}$.`,
    `So $${linear([[k, 'x']])} = ${tex(c - q * b)}$, which gives $x = ${tex(x0)}$.`,
  ];
  if (ask === 'y') {
    solution.push(`Substitute $x = ${tex(x0)}$ into $y = ${slopeForm}$ to get $y = ${tex(y0)}$.`);
  }

  const xSign = r(c + q * b, k);
  const xNoDistribute = r(c - b, k);
  const distractors = (): Candidate[] =>
    ask === 'x'
      ? pickDistractors(r(x0), [
          { value: r(y0), note: 'This is the value of $y$, not $x$.' },
          { value: xSign, note: 'A sign error when moving the constant term to the other side.' },
          {
            value: xNoDistribute,
            note: 'When distributing, multiply every term inside the parentheses, including the constant.',
          },
          ...fallbackCandidates(r(x0), rng),
        ])
      : pickDistractors(r(y0), [
          { value: r(x0), note: 'This is the value of $x$, not $y$.' },
          {
            value: r(m).mul(xSign).add(r(b)),
            note: 'A sign error while solving for $x$ carried into $y$.',
          },
          {
            value: r(m).mul(xNoDistribute).add(r(b)),
            note: 'The constant was not distributed, which threw off $x$ and then $y$.',
          },
          ...fallbackCandidates(r(y0), rng),
        ]);

  const stemSystem = system([
    ['y', slopeForm],
    [
      linear([
        [p, 'x'],
        [q, 'y'],
      ]),
      tex(c),
    ],
  ]);
  return body(format, stemSystem, ask, ask === 'x' ? r(x0) : r(y0), e1, e2, solution, distractors);
}

/** Medium: both equations in standard form, solved by elimination. */
function medium(rng: Rng, format: Format): GeneratedBody {
  const x0 = rng.int(-7, 7);
  const y0 = rng.int(-7, 7);
  let a1 = 0;
  let b1 = 0;
  let a2 = 0;
  let b2 = 0;
  do {
    a1 = rng.int(1, 6);
    b1 = nonZeroInt(rng, -6, 6);
    a2 = nonZeroInt(rng, -6, 6);
    b2 = nonZeroInt(rng, -6, 6);
  } while (a1 * b2 - a2 * b1 === 0);
  const c1 = a1 * x0 + b1 * y0;
  const c2 = a2 * x0 + b2 * y0;
  const ask: Ask = rng.pick(['x', 'y'] as const);
  const e1 = lin(a1, b1, c1);
  const e2 = lin(a2, b2, c2);

  const solution: string[] = [];
  if (b1 === b2) {
    solution.push(
      `The $y$-terms already match, so subtract the second equation from the first: $${linear([[a1 - a2, 'x']])} = ${tex(c1 - c2)}$.`,
    );
  } else if (b1 === -b2) {
    solution.push(
      `The $y$-terms are opposites, so add the equations: $${linear([[a1 + a2, 'x']])} = ${tex(c1 + c2)}$.`,
    );
  } else {
    solution.push(
      `To eliminate $y$, multiply the first equation by $${tex(b2)}$ and the second equation by $${tex(b1)}$: $$${system(
        [
          [
            linear([
              [a1 * b2, 'x'],
              [b1 * b2, 'y'],
            ]),
            tex(c1 * b2),
          ],
          [
            linear([
              [a2 * b1, 'x'],
              [b1 * b2, 'y'],
            ]),
            tex(c2 * b1),
          ],
        ],
      )}$$`,
      `Subtract the second new equation from the first: $${linear([[a1 * b2 - a2 * b1, 'x']])} = ${tex(c1 * b2 - c2 * b1)}$.`,
    );
  }
  solution.push(`So $x = ${tex(x0)}$.`);
  if (ask === 'y') {
    solution.push(
      `Substitute $x = ${tex(x0)}$ into the first equation: $${linear([[b1, 'y']], a1 * x0)} = ${tex(c1)}$, so $y = ${tex(y0)}$.`,
    );
  }

  const addDen = a1 * b2 + a2 * b1;
  const distractors = (): Candidate[] =>
    ask === 'x'
      ? pickDistractors(r(x0), [
          { value: r(y0), note: 'This is the value of $y$, not $x$.' },
          ...(addDen === 0
            ? []
            : [
                {
                  value: r(c1 * b2 + c2 * b1, addDen),
                  note: 'The equations were combined with the wrong operation, so $y$ was not eliminated.',
                },
              ]),
          ...fallbackCandidates(r(x0), rng),
        ])
      : pickDistractors(r(y0), [
          { value: r(x0), note: 'This is the value of $x$, not $y$.' },
          {
            value: r(c1 + a1 * x0, b1),
            note: 'The wrong sign was used for $x$ when substituting back.',
          },
          ...fallbackCandidates(r(y0), rng),
        ]);

  const stemSystem = system([
    [
      linear([
        [a1, 'x'],
        [b1, 'y'],
      ]),
      tex(c1),
    ],
    [
      linear([
        [a2, 'x'],
        [b2, 'y'],
      ]),
      tex(c2),
    ],
  ]);
  return body(format, stemSystem, ask, ask === 'x' ? r(x0) : r(y0), e1, e2, solution, distractors);
}

/** Hard: swapped coefficients reward adding or subtracting the equations instead of solving for x and y. */
function hard(rng: Rng, format: Format): GeneratedBody {
  let a = 0;
  let b = 0;
  do {
    a = rng.int(2, 9);
    b = nonZeroInt(rng, -9, 9);
  } while ((a - b) % 2 !== 0 || Math.abs(a) === Math.abs(b));
  const ask: Ask = rng.pick(['x+y', 'x-y'] as const);
  const x0 = r(2 * rng.int(-5, 4) + 1, 2);
  const target = r(nonZeroInt(rng, -12, 12));
  const y0 = ask === 'x+y' ? target.sub(x0) : x0.sub(target);
  const c1 = r(a).mul(x0).add(r(b).mul(y0));
  const c2 = r(b).mul(x0).add(r(a).mul(y0));
  const e1 = lin(a, b, c1);
  const e2 = lin(b, a, c2);

  const plus = ask === 'x+y';
  const factor = plus ? a + b : a - b;
  const rhs = plus ? c1.add(c2) : c1.sub(c2);
  const solution = [
    plus
      ? `The coefficients of $x$ and $y$ trade places between the equations, so add the equations: $${linear(
          [
            [factor, 'x'],
            [factor, 'y'],
          ],
        )} = ${tex(rhs)}$.`
      : `The coefficients of $x$ and $y$ trade places between the equations, so subtract the second equation from the first: $${linear(
          [
            [factor, 'x'],
            [-factor, 'y'],
          ],
        )} = ${tex(rhs)}$.`,
    `Factor out $${tex(factor)}$: $${tex(factor)}(${ASK_TEX[ask]}) = ${tex(rhs)}$, so $${ASK_TEX[ask]} = ${tex(target)}$.`,
    `You never need $x$ and $y$ on their own. They are $x = ${tex(x0)}$ and $y = ${tex(y0)}$, which take longer to find.`,
  ];

  const other = plus ? x0.sub(y0) : x0.add(y0);
  const wrongFactor = plus ? a - b : a + b;
  const distractors = (): Candidate[] =>
    pickDistractors(target, [
      { value: x0, note: 'This is the value of $x$ alone.' },
      {
        value: other,
        note: plus ? 'This is $x - y$, not $x + y$.' : 'This is $x + y$, not $x - y$.',
      },
      {
        value: rhs.div(r(wrongFactor)),
        note: 'Divided by the wrong coefficient after combining the equations.',
      },
      {
        value: rhs,
        note: 'Combined the equations but forgot to divide by the common coefficient.',
      },
      ...fallbackCandidates(target, rng),
    ]);

  const stemSystem = system([
    [
      linear([
        [a, 'x'],
        [b, 'y'],
      ]),
      tex(c1),
    ],
    [
      linear([
        [b, 'x'],
        [a, 'y'],
      ]),
      tex(c2),
    ],
  ]);
  return body(format, stemSystem, ask, target, e1, e2, solution, distractors);
}

const BUILDERS: Record<Difficulty, (rng: Rng, format: Format) => GeneratedBody> = {
  easy,
  medium,
  hard,
};

export const systemsSolve: ProblemType = {
  id: 'alg.systems.solve-system',
  version: 1,
  skill: 'alg.systems',
  supports: { easy: ['mcq', 'spr'], medium: ['mcq', 'spr'], hard: ['mcq', 'spr'] },
  generate: (rng, difficulty, format) => BUILDERS[difficulty](rng, format),
  verify(problem: Problem): boolean {
    const meta = problem.meta ?? {};
    const ask = meta['ask'] as Ask;
    const sol = solve2(eqFromMeta(meta['e1']), eqFromMeta(meta['e2']));
    if (sol.kind !== 'one' || !(ask in ASK_TEX)) return false;
    const target =
      ask === 'x'
        ? sol.x
        : ask === 'y'
          ? sol.y
          : ask === 'x+y'
            ? sol.x.add(sol.y)
            : sol.x.sub(sol.y);
    const given = answerValue(problem);
    return given !== null && Rational.parse(given).eq(target);
  },
};
