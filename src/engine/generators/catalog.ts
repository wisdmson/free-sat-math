import { linear, tex } from '../format';
import type { Difficulty, GeneratedBody, Problem, ProblemType } from '../problem';
import { Rational, r } from '../rational';
import type { Rng } from '../rng';
import {
  answerValue,
  fallbackCandidates,
  isNice,
  numericAnswer,
  shuffledChoices,
  type Candidate,
} from './shared/choices';

interface Scenario {
  kind: string;
  values: number[];
  stem: string;
  solution: string[];
  desmos?: string[];
}

type Topic = {
  id: string;
  skill: Problem['skill'];
  make(rng: Rng, difficulty: Difficulty): Scenario;
};

const integer = (rng: Rng, difficulty: Difficulty, easy: number, hard: number): number =>
  rng.int(-(difficulty === 'hard' ? hard : easy), difficulty === 'easy' ? easy : hard);

function expected(kind: string, v: readonly number[]): Rational | string {
  const [a, b, c, d] = v as [number, number, number, number];
  switch (kind) {
    case 'linear-one':
      return r(c).sub(r(b)).div(r(a));
    case 'function':
    case 'line':
      return r(a).mul(r(c)).add(r(b));
    case 'inequality':
      return r(c - 1);
    case 'equivalent':
      return r(a * b + c);
    case 'quadratic-roots':
      return r(Math.max(a, b));
    case 'quadratic-value':
      return r(a * (c - b) ** 2 + d);
    case 'rate':
      return r(a).mul(r(c));
    case 'percent':
      return r(a)
        .mul(r(100 + b))
        .div(r(100));
    case 'mean':
      return r(
        v.slice(0, 4).reduce((sum, n) => sum + n, 0),
        4,
      );
    case 'trend':
      return r(a).mul(r(c)).add(r(b));
    case 'probability':
      return r(a, b);
    case 'inference':
      return r(a - c);
    case 'claim':
      return 'randomized';
    case 'volume':
      return r(a).mul(r(b)).mul(r(c));
    case 'angles':
      return r(180).sub(r(a)).sub(r(b));
    case 'pythagorean':
      return r(a).mul(r(5));
    case 'circle-radius':
      return r(a);
    default:
      throw new Error(`Unknown catalog generator: ${kind}`);
  }
}

/** Recomputes answers from the prompt parameters without using the generator's answer helper. */
function verifiedValue(kind: string, v: readonly number[]): Rational | string {
  const [a, b, c, d] = v as [number, number, number, number];
  switch (kind) {
    case 'linear-one':
      return Rational.of(c - b, a);
    case 'function':
    case 'line':
    case 'trend':
      return Rational.of(a * c + b);
    case 'inequality':
      return Rational.of(c - 1);
    case 'equivalent':
      return Rational.of(a * b + c);
    case 'quadratic-roots':
      return Rational.of(a > b ? a : b);
    case 'quadratic-value': {
      const difference = c - b;
      return Rational.of(a * difference * difference + d);
    }
    case 'rate':
      return Rational.of(a * c);
    case 'percent':
      return Rational.of(a * (100 + b), 100);
    case 'mean':
      return Rational.of(
        v.slice(0, 4).reduce((sum, n) => sum + n, 0),
        4,
      );
    case 'probability':
      return Rational.of(a, b);
    case 'inference':
      return Rational.of(a - c);
    case 'volume':
      return Rational.of(a * b * c);
    case 'angles':
      return Rational.of(180 - a - b);
    case 'pythagorean':
      return Rational.of(5 * a);
    case 'circle-radius':
      return Rational.of(a);
    case 'claim':
      return 'randomized';
    default:
      throw new Error(`Unknown catalog verification kind: ${kind}`);
  }
}

/** Answers a student gets from a common mistake, tried before the generic slips. */
function mistakes(kind: string, v: readonly number[]): Candidate[] {
  const [a, b, c] = v as [number, number, number];
  const m = (value: Rational, note: string): Candidate => ({ value, note });
  switch (kind) {
    case 'linear-one':
      return [
        m(r(c + b, a), 'The constant was added instead of subtracted when moving it across.'),
        m(
          r(c - b),
          'Subtracting was right, but the last step forgot to divide by the coefficient.',
        ),
        m(
          r(c, a).sub(r(b)),
          'Divided before moving the constant: that splits the equation unevenly.',
        ),
      ];
    case 'function':
    case 'line':
    case 'trend':
      return [
        m(r(a * c - b), 'The constant term was subtracted instead of added.'),
        m(r(b * c + a), 'The slope and the intercept were swapped.'),
        m(r(a * (c + b)), 'The constant was added before multiplying by the slope.'),
      ];
    case 'inequality':
      return [
        m(r(c), 'The boundary itself is not a solution: the inequality is strict (<).'),
        m(r(c + 1), 'Numbers greater than the boundary make the inequality false.'),
        m(r(c - 2), 'There is a greater integer that still works.'),
      ];
    case 'equivalent':
      return [
        m(
          r(b + c),
          'The coefficient in front of the parentheses was not distributed to the constant.',
        ),
        m(r(a * b), 'The separate x-term was left out when combining like terms.'),
        m(r(a * b - c), 'The separate x-term was subtracted instead of added.'),
      ];
    case 'quadratic-roots':
      return [
        m(r(Math.min(a, b)), 'That is the smaller of the two solutions.'),
        m(r(-Math.max(a, b)), 'A factor (x - k) gives the solution x = k, not x = -k.'),
        m(r(-Math.min(a, b)), 'A factor (x - k) gives the solution x = k, not x = -k.'),
      ];
    case 'quadratic-value': {
      const d = v[3] as number;
      return [
        m(
          r(a * (c + b) ** 2 + d),
          'In a(x - h)², the sign inside the parentheses is opposite to h.',
        ),
        m(r(a * 2 * (c - b) + d), 'The difference was doubled instead of squared.'),
        m(r(a * (c - b) ** 2 - d), 'The constant k was subtracted instead of added.'),
      ];
    }
    case 'rate':
      return [
        m(
          r(a * b * c),
          'Multiplied the total by the new time without finding the rate per minute first.',
        ),
        m(r(a * c, b), 'Divided by the time twice: the rate per minute was already found.'),
        m(r(a * b + c), 'Added the minutes instead of multiplying by the rate.'),
      ];
    case 'percent':
      return [
        m(r(a * b, 100), 'That is only the increase; add it to the original value.'),
        m(r(a + b), 'The percent was added as a number instead of as a percent of the value.'),
        m(r(a * (100 - b), 100), 'That is a decrease; the value increases.'),
      ];
    case 'mean': {
      const sum = v.slice(0, 4).reduce((t, n) => t + n, 0);
      const sorted = [...v.slice(0, 4)].sort((x, y) => x - y);
      return [
        m(r(sum), 'That is the total; divide by the number of values.'),
        m(
          r((sorted[1] as number) + (sorted[2] as number), 2),
          'That is the median, the middle of the sorted values.',
        ),
        m(r(sum, 3), 'There are 4 values, so divide by 4, not 3.'),
      ];
    }
    case 'probability':
      return [
        m(r(a, b - a), 'That compares red to blue; probability compares red to all tokens.'),
        m(r(b - a, b), 'That is the probability of blue.'),
        m(r(1, b), 'That is the chance of one particular token, not of any red one.'),
      ];
    case 'inference':
      return [
        m(r(a + c), 'That is the upper end of the interval.'),
        m(r(a), 'That is the sample estimate; subtract the margin for the lower end.'),
        m(r(c), 'That is the margin of error itself.'),
      ];
    case 'volume':
      return [
        m(r(2 * (a * b + b * c + a * c)), 'That is the surface area, not the volume.'),
        m(r(a + b + c), 'The dimensions were added instead of multiplied.'),
        m(r(a * b), 'That is the area of the base; multiply by the height too.'),
      ];
    case 'angles':
      return [
        m(r(a + b), 'That is the sum of the two given angles.'),
        m(r(360 - a - b), 'The angles of a triangle add to 180°, not 360°.'),
        m(r(90 - a - b + 90 - b), 'Check the total: the three angles must add to 180°.'),
      ];
    case 'pythagorean':
      return [
        m(r(7 * a), 'The legs were added: the hypotenuse is shorter than their sum.'),
        m(r(25 * a * a), 'That is c²; take the square root for the length.'),
        m(r(a), 'That is the difference of the legs, not the hypotenuse.'),
      ];
    case 'circle-radius':
      return [
        m(r(a * a), 'That is r²; take the square root for the radius.'),
        m(r(2 * a), 'That is the diameter.'),
        m(r(a * a, 2), 'Halving r² does not give the radius; take the square root.'),
      ];
    default:
      return [];
  }
}

/** Quantities that can't be negative never get negative answer choices. */
const NON_NEGATIVE = new Set([
  'rate',
  'percent',
  'probability',
  'inference',
  'volume',
  'angles',
  'pythagorean',
  'circle-radius',
]);

/**
 * Three wrong choices, common mistakes first. Choices are listed smallest to largest like the
 * SAT, so the correct answer's position is picked at random first (A to D equally often) and
 * the wrong choices are chosen to fit around it.
 */
function distractors(kind: string, v: readonly number[], answer: Rational, rng: Rng): Candidate[] {
  const rule = { maxDen: 100, ...(NON_NEGATIVE.has(kind) ? { min: 0 } : {}) };
  const generic: Candidate[] = [
    ...fallbackCandidates(answer, rng),
    { value: answer.mul(r(1, 2)), note: 'The value was halved somewhere along the way.' },
  ];
  const pool: Candidate[] = [];
  for (const c of [...rng.shuffle(mistakes(kind, v)), ...rng.shuffle(generic)]) {
    if (c.value.eq(answer) || !isNice(c.value, rule) || pool.some((p) => p.value.eq(c.value)))
      continue;
    pool.push(c);
  }
  const below = pool.filter((c) => c.value.cmp(answer) < 0);
  const above = pool.filter((c) => c.value.cmp(answer) > 0);
  const want = rng.int(0, 3);
  const positions = [0, 1, 2, 3].sort((x, y) => Math.abs(x - want) - Math.abs(y - want));
  for (const pos of positions) {
    if (below.length >= pos && above.length >= 3 - pos)
      return [...below.slice(0, pos), ...above.slice(0, 3 - pos)];
  }
  throw new Error('Not enough distinct distractors');
}

function numericType(topic: Topic): ProblemType {
  return {
    id: topic.id,
    version: 3,
    skill: topic.skill,
    supports: { easy: ['mcq', 'spr'], medium: ['mcq', 'spr'], hard: ['mcq', 'spr'] },
    generate(rng, difficulty, format): GeneratedBody {
      const s = topic.make(rng, difficulty);
      const answer = expected(s.kind, s.values);
      if (typeof answer === 'string') throw new Error(`${s.kind} needs a choice type`);
      return {
        stem: s.stem,
        ...numericAnswer(format, answer, () => distractors(s.kind, s.values, answer, rng)),
        solution: s.solution,
        ...(s.desmos === undefined ? {} : { desmos: s.desmos }),
        meta: { kind: s.kind, values: s.values },
      };
    },
    verify(problem: Problem): boolean {
      const meta = problem.meta ?? {};
      const kind = meta['kind'];
      const values = meta['values'];
      if (
        typeof kind !== 'string' ||
        !Array.isArray(values) ||
        !values.every((v) => typeof v === 'number' && Number.isFinite(v))
      )
        return false;
      const correct = verifiedValue(kind, values as number[]);
      return typeof correct !== 'string' && correct.toString() === answerValue(problem);
    },
  };
}

function type(topic: Topic): ProblemType {
  if (topic.skill !== 'psda.claims') return numericType(topic);
  return {
    id: topic.id,
    version: 3,
    skill: topic.skill,
    supports: { easy: ['mcq'], medium: ['mcq'], hard: ['mcq'] },
    generate(rng, difficulty): GeneratedBody {
      const s = topic.make(rng, difficulty);
      const correct = {
        text: 'The randomized experiment supports a cause-and-effect conclusion for the studied group.',
        value: 'randomized',
      };
      return {
        stem: s.stem,
        ...shuffledChoices(rng, correct, [
          {
            text: 'A survey always proves that one variable caused the other.',
            value: 'survey',
            note: 'A survey can show an association, but it does not assign treatments.',
          },
          {
            text: 'An observational study proves that changing one variable caused the outcome.',
            value: 'observational',
            note: 'Researchers only observe existing groups, so other differences may explain the outcome.',
          },
          {
            text: 'A convenience sample represents every member of the population.',
            value: 'convenience',
            note: 'A convenience sample can leave out important parts of the population.',
          },
        ]),
        solution: s.solution,
        meta: { kind: 'claim', values: s.values },
      };
    },
    verify(problem: Problem): boolean {
      const meta = problem.meta ?? {};
      return (
        meta['kind'] === 'claim' &&
        Array.isArray(meta['values']) &&
        answerValue(problem) === 'randomized'
      );
    },
  };
}

const TOPICS: readonly Topic[] = [
  {
    id: 'alg.linear-one-var.solve',
    skill: 'alg.linear-one-var',
    make(rng, d) {
      const x = integer(rng, d, 8, 20);
      const a = rng.int(2, d === 'hard' ? 9 : 5);
      const b = rng.int(-12, 12);
      const c = a * x + b;
      return {
        kind: 'linear-one',
        values: [a, b, c],
        stem: `Solve for $x$: $${linear([[a, 'x']], b)} = ${tex(c)}$.`,
        solution: [
          `Subtract $${tex(b)}$ from both sides: $${tex(a)}x = ${tex(c - b)}$.`,
          `Divide by $${tex(a)}$: $x = ${tex(x)}$.`,
        ],
        desmos: [`y = ${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}`, `y = ${c}`],
      };
    },
  },
  {
    id: 'alg.linear-functions.slope-intercept',
    skill: 'alg.linear-functions',
    make(rng, d) {
      const m = integer(rng, d, 5, 12) || 2;
      const b = integer(rng, d, 8, 18);
      const x = rng.int(2, 9);
      return {
        kind: 'function',
        values: [m, b, x],
        stem: `A linear function is $f(x) = ${linear([[m, 'x']], b)}$. What is $f(${x})$?`,
        solution: [
          `Substitute $${x}$ for $x$: $f(${x}) = ${tex(m)}(${x}) ${b < 0 ? '-' : '+'} ${tex(Math.abs(b))}$.`,
          `Evaluate: $f(${x}) = ${tex(m * x + b)}$.`,
        ],
        desmos: [`f(x) = ${m}x + (${b})`, `f(${x})`],
      };
    },
  },
  {
    id: 'alg.linear-two-var.line-equation',
    skill: 'alg.linear-two-var',
    make(rng, d) {
      const m = integer(rng, d, 4, 9) || 2;
      const b = integer(rng, d, 8, 16);
      const x = rng.int(2, 8);
      return {
        kind: 'line',
        values: [m, b, x],
        stem: `A line has equation $y = ${linear([[m, 'x']], b)}$. What is the $y$-coordinate when $x = ${x}$?`,
        solution: [
          `Substitute $x = ${x}$: $y = ${tex(m)}(${x}) ${b < 0 ? '-' : '+'} ${tex(Math.abs(b))}$.`,
          `So the point on the line is $(${x}, ${tex(m * x + b)})$.`,
        ],
        desmos: [`y = ${m}x + (${b})`, `x = ${x}`],
      };
    },
  },
  {
    id: 'alg.inequalities.solve',
    skill: 'alg.inequalities',
    make(rng, d) {
      const boundary = rng.int(-5, 10);
      const a = rng.int(2, d === 'hard' ? 9 : 5);
      const b = rng.int(-12, 12);
      const c = a * boundary + b;
      return {
        kind: 'inequality',
        values: [a, b, boundary],
        stem: `What is the greatest integer solution to $${linear([[a, 'x']], b)} < ${tex(c)}$?`,
        solution: [
          `Subtract $${tex(b)}$: $${tex(a)}x < ${tex(c - b)}$.`,
          `Divide by positive $${tex(a)}$: $x < ${tex(boundary)}$.`,
          `The greatest integer less than ${boundary} is $${tex(boundary - 1)}$.`,
        ],
        desmos: [`y = ${a}x + (${b})`, `y = ${c}`, `x < ${boundary}`],
      };
    },
  },
  {
    id: 'adv.equivalent-expressions.expand-simplify',
    skill: 'adv.equivalent-expressions',
    make(rng, d) {
      const a = rng.int(2, d === 'hard' ? 9 : 5);
      const b = rng.int(-9, 9);
      const c = rng.int(1, d === 'hard' ? 8 : 4);
      return {
        kind: 'equivalent',
        values: [a, b, c],
        stem: `When $${linear([[a, 'x']])}(${linear([[1, 'x']], b)}) + ${linear([[c, 'x']])}$ is written as $Ax^2 + Bx + C$, what is $B$?`,
        solution: [
          `Distribute: $${tex(a)}x(x ${b < 0 ? '-' : '+'} ${tex(Math.abs(b))}) = ${linear([
            [a, 'x^2'],
            [a * b, 'x'],
          ])}$.`,
          `Combine the $x$-terms: $${linear([[a * b, 'x']])} + ${linear([[c, 'x']])} = ${linear([[a * b + c, 'x']])}$.`,
          `Therefore, $B = ${tex(a * b + c)}$.`,
        ],
        desmos: [`f(x) = ${a}x(x + (${b})) + ${c}x`, `g(x) = ${a}x^2 + (${a * b + c})x`],
      };
    },
  },
  {
    id: 'adv.nonlinear-equations.quadratic-solve',
    skill: 'adv.nonlinear-equations',
    make(rng, d) {
      const limit = d === 'hard' ? 14 : 10;
      const a = rng.int(-limit, 4);
      const b = rng.int(2, limit);
      const greater = Math.max(a, b);
      return {
        kind: 'quadratic-roots',
        values: [a, b],
        stem: `The equation $(x ${a < 0 ? '+' : '-'} ${Math.abs(a)})(x - ${b}) = 0$ has two solutions. What is the greater solution?`,
        solution: [
          `A product is zero when at least one factor is zero.`,
          `Set each factor to zero: $x = ${a}$ or $x = ${b}$.`,
          `The greater solution is $${greater}$.`,
        ],
        desmos: [`y = (x - (${a}))(x - ${b})`, `y = 0`],
      };
    },
  },
  {
    id: 'adv.nonlinear-functions.vertex-form',
    skill: 'adv.nonlinear-functions',
    make(rng, d) {
      const a = rng.int(1, d === 'hard' ? 5 : 3);
      const h = rng.int(-5, 5);
      const k = rng.int(-12, 12);
      const x = h + rng.int(-3, 4);
      return {
        kind: 'quadratic-value',
        values: [a, h, x, k],
        stem: `A quadratic function is $f(x) = ${a}(x ${h < 0 ? '+' : '-'} ${Math.abs(h)})^2 ${k < 0 ? '-' : '+'} ${Math.abs(k)}$. What is $f(${x})$?`,
        solution: [
          `Substitute $x = ${x}$: $f(${x}) = ${a}(${x} - (${h}))^2 + (${k})$.`,
          `Square the difference and multiply by ${a}: $${a * (x - h) ** 2} + (${k})$.`,
          `So $f(${x}) = ${a * (x - h) ** 2 + k}$.`,
        ],
        desmos: [`f(x) = ${a}(x - (${h}))^2 + (${k})`, `f(${x})`],
      };
    },
  },
  {
    id: 'psda.ratios-rates.proportional-rate',
    skill: 'psda.ratios-rates',
    make(rng, d) {
      const rate = rng.int(3, d === 'hard' ? 18 : 10);
      const hours = rng.int(2, 6);
      const asked = rng.int(2, 8);
      return {
        kind: 'rate',
        values: [rate, hours, asked],
        stem: `A printer makes $${rate * hours}$ pages in $${hours}$ minutes at a constant rate. How many pages will it make in $${asked}$ minutes?`,
        solution: [
          `Find the unit rate: $${rate * hours} \\div ${hours} = ${rate}$ pages per minute.`,
          `Multiply by ${asked} minutes: $${rate} \\times ${asked} = ${rate * asked}$.`,
        ],
        desmos: [`y = ${rate}x`, `(${asked}, ${rate * asked})`],
      };
    },
  },
  {
    id: 'psda.percentages.percent-basic',
    skill: 'psda.percentages',
    make(rng, d) {
      const original = rng.pick([40, 60, 80, 100, 120, 160, 200]);
      const pct = rng.pick(d === 'hard' ? [15, 20, 25, 30, 40, 50] : [10, 15, 20, 25]);
      return {
        kind: 'percent',
        values: [original, pct],
        stem: `A value of $${original}$ increases by $${pct}\\%$. What is the new value?`,
        solution: [
          `Find the increase: $${pct}\\%$ of $${original}$ is $${tex(r(original * pct, 100))}$.`,
          `Add the increase to the original: $${original} + ${tex(r(original * pct, 100))} = ${tex(
            r(original)
              .mul(r(100 + pct))
              .div(r(100)),
          )}$.`,
        ],
        desmos: [`y = ${original}(1 + ${pct}/100)`],
      };
    },
  },
  {
    id: 'psda.one-var-data.center-spread',
    skill: 'psda.one-var-data',
    make(rng, d) {
      const values = Array.from({ length: 4 }, () => rng.int(2, d === 'hard' ? 30 : 15));
      const mean = values.reduce((sum, n) => sum + n, 0) / 4;
      return {
        kind: 'mean',
        values,
        stem: `The data set is $${values.join(', ')}$. What is its mean?`,
        solution: [
          `Add the four values: $${values.join(' + ')} = ${values.reduce((sum, n) => sum + n, 0)}$.`,
          `Divide by the 4 data values: $${values.reduce((sum, n) => sum + n, 0)} \\div 4 = ${mean}$.`,
        ],
        desmos: [`[${values.join(', ')}]`, `mean([${values.join(', ')}])`],
      };
    },
  },
  {
    id: 'psda.two-var-data.best-fit-read',
    skill: 'psda.two-var-data',
    make(rng, d) {
      const m = rng.int(2, d === 'hard' ? 9 : 5);
      const b = rng.int(1, 12);
      const x = rng.int(3, 12);
      return {
        kind: 'trend',
        values: [m, b, x],
        stem: `A line of best fit for a data set is $y = ${linear([[m, 'x']], b)}$. Use this model to predict $y$ when $x = ${x}$.`,
        solution: [
          `Substitute ${x} for $x$: $y = ${m}(${x}) + (${b})$.`,
          `Evaluate the model: $y = ${m * x + b}$. This is a prediction, not necessarily an observed data value.`,
        ],
        desmos: [`y = ${m}x + ${b}`, `(${x}, ${m * x + b})`],
      };
    },
  },
  {
    id: 'psda.probability.two-way-table',
    skill: 'psda.probability',
    make(rng, d) {
      const total = rng.int(6, d === 'hard' ? 30 : 15);
      const favorable = rng.int(1, total - 1);
      return {
        kind: 'probability',
        values: [favorable, total],
        stem: `A bag contains ${favorable} red tokens and ${total - favorable} blue tokens. One token is chosen at random. What is the probability it is red?`,
        solution: [
          `There are ${favorable} favorable outcomes and ${total} equally likely outcomes in total.`,
          `So $P(\\text{red}) = \\frac{${favorable}}{${total}} = ${tex(r(favorable, total))}$.`,
        ],
        desmos: [`p = ${favorable}/${total}`, `p`],
      };
    },
  },
  {
    id: 'psda.inference.sample-margin',
    skill: 'psda.inference',
    make(rng) {
      const estimate = rng.pick([60, 65, 70, 75, 80]);
      const margin = rng.pick([5, 8, 10]);
      const successes = estimate;
      return {
        kind: 'inference',
        values: [successes, 100, margin],
        stem: `In a random sample, $${successes}$ out of $100$ students prefer later school start times. The margin of error is $${margin}$ percentage points. What is the lower end of the estimated interval, as a percent?`,
        solution: [
          `The sample estimate is $${successes}\\%$. Subtract the margin of error for the lower end.`,
          `$${successes}\\% - ${margin}$ percentage points $= ${successes - margin}\\%$.`,
          `The interval's lower end is ${successes - margin}%. The margin describes sampling uncertainty; it is not a guarantee about every student.`,
        ],
        desmos: [`y = ${successes} - ${margin}`, `y = ${successes}`],
      };
    },
  },
  {
    id: 'psda.claims.evaluate-study',
    skill: 'psda.claims',
    make(_rng, d) {
      const participants = d === 'easy' ? 120 : d === 'medium' ? 240 : 480;
      return {
        kind: 'claim',
        values: [participants],
        stem: `Researchers randomly assign ${participants} volunteers to either a new study schedule or the usual schedule, then compare their test scores. Which conclusion is best supported by this design?`,
        solution: [
          'Random assignment helps balance other differences between the groups.',
          'Because researchers assigned the schedules, a difference in scores can support a cause-and-effect conclusion for the volunteers in this study.',
          'This alone does not show that the result applies to every student; that also depends on how representative the volunteers are.',
        ],
      };
    },
  },
  {
    id: 'geo.area-volume.solid-volume',
    skill: 'geo.area-volume',
    make(rng, d) {
      const a = rng.int(2, d === 'hard' ? 12 : 7);
      const b = rng.int(2, d === 'hard' ? 10 : 6);
      const c = rng.int(2, d === 'hard' ? 9 : 5);
      return {
        kind: 'volume',
        values: [a, b, c],
        stem: `A rectangular prism is $${a}$ units long, $${b}$ units wide, and $${c}$ units tall. What is its volume in cubic units?`,
        solution: [
          `Use $V = lwh$ for a rectangular prism.`,
          `$V = ${a} \\times ${b} \\times ${c} = ${a * b * c}$ cubic units.`,
        ],
        desmos: [`V = ${a}*${b}*${c}`, `V`],
      };
    },
  },
  {
    id: 'geo.lines-angles-triangles.triangle-angle-sum',
    skill: 'geo.lines-angles-triangles',
    make(rng) {
      const a = rng.int(30, 85);
      const b = rng.int(30, 85);
      return {
        kind: 'angles',
        values: [a, b],
        stem: `Two angles in a triangle measure $${a}^\\circ$ and $${b}^\\circ$. What is the measure of the third angle?`,
        solution: [
          `The angles in a triangle add to $180^\\circ$.`,
          `$180^\\circ - ${a}^\\circ - ${b}^\\circ = ${180 - a - b}^\\circ$.`,
        ],
        desmos: [`x + ${a} + ${b} = 180`, `x = ${180 - a - b}`],
      };
    },
  },
  {
    id: 'geo.right-triangles-trig.pythagorean',
    skill: 'geo.right-triangles-trig',
    make(rng, d) {
      const scale = rng.int(1, d === 'hard' ? 9 : 4);
      return {
        kind: 'pythagorean',
        values: [scale],
        stem: `A right triangle has legs measuring $${3 * scale}$ and $${4 * scale}$ units. What is the length of its hypotenuse?`,
        solution: [
          `Use the Pythagorean theorem: $a^2 + b^2 = c^2$.`,
          `$(${3 * scale})^2 + (${4 * scale})^2 = ${25 * scale * scale}$, so $c = \\sqrt{${25 * scale * scale}} = ${5 * scale}$.`,
        ],
        desmos: [`(${3 * scale})^2 + (${4 * scale})^2 = c^2`, `c = ${5 * scale}`],
      };
    },
  },
  {
    id: 'geo.circles.circle-equation',
    skill: 'geo.circles',
    make(rng, d) {
      const radius = rng.int(2, d === 'hard' ? 14 : 8);
      const h = rng.int(-5, 5);
      const k = rng.int(-5, 5);
      return {
        kind: 'circle-radius',
        values: [radius],
        stem: `A circle has equation $(x - (${h}))^2 + (y - (${k}))^2 = ${radius * radius}$. What is its radius?`,
        solution: [
          `A circle in standard form is $(x-h)^2 + (y-k)^2 = r^2$.`,
          `Here $r^2 = ${radius * radius}$, so the radius is $r = \\sqrt{${radius * radius}} = ${radius}$.`,
        ],
        desmos: [`(x - (${h}))^2 + (y - (${k}))^2 = ${radius * radius}`],
      };
    },
  },
];

export const CATALOG_TYPES: readonly ProblemType[] = TOPICS.map(type);
