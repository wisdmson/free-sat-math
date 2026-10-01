import { arithmetic } from './drills/arithmetic';
import { exponents } from './drills/exponents';
import { fdp } from './drills/fdp';
import { percent } from './drills/percent';
import { shortcuts } from './drills/shortcuts';
import { squares } from './drills/squares';
import type { Drill } from './types';

/** Every Mental Math drill (spec §4.1). Add new drills here. */
export const DRILLS: readonly Drill[] = [arithmetic, fdp, percent, squares, exponents, shortcuts];

export const getDrill = (id: string): Drill | undefined => DRILLS.find((d) => d.id === id);
