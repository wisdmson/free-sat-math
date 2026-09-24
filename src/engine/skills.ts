export type DomainId = 'algebra' | 'advanced' | 'psda' | 'geometry';

export interface Domain {
  id: DomainId;
  name: string;
  /** Share of SAT Math questions from this domain. */
  share: number;
}

export const DOMAINS: readonly Domain[] = [
  { id: 'algebra', name: 'Algebra', share: 0.35 },
  { id: 'advanced', name: 'Advanced Math', share: 0.35 },
  { id: 'psda', name: 'Problem-Solving and Data Analysis', share: 0.15 },
  { id: 'geometry', name: 'Geometry and Trigonometry', share: 0.15 },
];

/** Where a skill's practice problems come from (spec §8.1). */
export type SkillSource = 'generator' | 'mixed' | 'bank';

export const SKILL_IDS = [
  'alg.linear-one-var',
  'alg.linear-functions',
  'alg.linear-two-var',
  'alg.systems',
  'alg.inequalities',
  'adv.equivalent-expressions',
  'adv.nonlinear-equations',
  'adv.nonlinear-functions',
  'psda.ratios-rates',
  'psda.percentages',
  'psda.one-var-data',
  'psda.two-var-data',
  'psda.probability',
  'psda.inference',
  'psda.claims',
  'geo.area-volume',
  'geo.lines-angles-triangles',
  'geo.right-triangles-trig',
  'geo.circles',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export interface Skill {
  id: SkillId;
  domain: DomainId;
  name: string;
  source: SkillSource;
}

export const SKILLS: readonly Skill[] = [
  {
    id: 'alg.linear-one-var',
    domain: 'algebra',
    name: 'Linear equations in one variable',
    source: 'generator',
  },
  { id: 'alg.linear-functions', domain: 'algebra', name: 'Linear functions', source: 'generator' },
  {
    id: 'alg.linear-two-var',
    domain: 'algebra',
    name: 'Linear equations in two variables',
    source: 'generator',
  },
  {
    id: 'alg.systems',
    domain: 'algebra',
    name: 'Systems of two linear equations in two variables',
    source: 'generator',
  },
  {
    id: 'alg.inequalities',
    domain: 'algebra',
    name: 'Linear inequalities in one or two variables',
    source: 'generator',
  },
  {
    id: 'adv.equivalent-expressions',
    domain: 'advanced',
    name: 'Equivalent expressions',
    source: 'generator',
  },
  {
    id: 'adv.nonlinear-equations',
    domain: 'advanced',
    name: 'Nonlinear equations in one variable and systems of equations in two variables',
    source: 'generator',
  },
  {
    id: 'adv.nonlinear-functions',
    domain: 'advanced',
    name: 'Nonlinear functions',
    source: 'mixed',
  },
  {
    id: 'psda.ratios-rates',
    domain: 'psda',
    name: 'Ratios, rates, proportional relationships, and units',
    source: 'generator',
  },
  { id: 'psda.percentages', domain: 'psda', name: 'Percentages', source: 'generator' },
  {
    id: 'psda.one-var-data',
    domain: 'psda',
    name: 'One-variable data: distributions and measures of center and spread',
    source: 'mixed',
  },
  {
    id: 'psda.two-var-data',
    domain: 'psda',
    name: 'Two-variable data: models and scatterplots',
    source: 'mixed',
  },
  {
    id: 'psda.probability',
    domain: 'psda',
    name: 'Probability and conditional probability',
    source: 'mixed',
  },
  {
    id: 'psda.inference',
    domain: 'psda',
    name: 'Inference from sample statistics and margin of error',
    source: 'bank',
  },
  {
    id: 'psda.claims',
    domain: 'psda',
    name: 'Evaluating statistical claims: observational studies and experiments',
    source: 'bank',
  },
  { id: 'geo.area-volume', domain: 'geometry', name: 'Area and volume', source: 'generator' },
  {
    id: 'geo.lines-angles-triangles',
    domain: 'geometry',
    name: 'Lines, angles, and triangles',
    source: 'mixed',
  },
  {
    id: 'geo.right-triangles-trig',
    domain: 'geometry',
    name: 'Right triangles and trigonometry',
    source: 'generator',
  },
  { id: 'geo.circles', domain: 'geometry', name: 'Circles', source: 'generator' },
];

export function isSkillId(id: string): id is SkillId {
  return (SKILL_IDS as readonly string[]).includes(id);
}

export function getSkill(id: SkillId): Skill {
  const skill = SKILLS.find((s) => s.id === id);
  if (!skill) throw new Error(`Unknown skill ${id}`);
  return skill;
}

export function skillsInDomain(domain: DomainId): Skill[] {
  return SKILLS.filter((s) => s.domain === domain);
}

/** A skill's expected share of test questions: its domain's share split evenly across the domain's skills. */
export function testWeight(id: SkillId): number {
  const skill = getSkill(id);
  const domain = DOMAINS.find((d) => d.id === skill.domain) as Domain;
  return domain.share / skillsInDomain(skill.domain).length;
}
