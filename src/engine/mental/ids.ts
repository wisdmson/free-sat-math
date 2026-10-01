/** The six Mental Math drills (spec §4.1). Generators arrive in the Mental Math plan. */
export const DRILL_IDS = [
  'mm.arithmetic',
  'mm.fdp',
  'mm.percent',
  'mm.squares',
  'mm.exponents',
  'mm.shortcuts',
] as const;

export type DrillId = (typeof DRILL_IDS)[number];
