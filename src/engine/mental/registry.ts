import { arithmetic } from './drills/arithmetic';
import { fdp } from './drills/fdp';
import { percent } from './drills/percent';
import type { Drill } from './types';

/** Every Mental Math drill (spec §4.1). Add new drills here. */
export const DRILLS: readonly Drill[] = [arithmetic, fdp, percent];

export const getDrill = (id: string): Drill | undefined => DRILLS.find((d) => d.id === id);
