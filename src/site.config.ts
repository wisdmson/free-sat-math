export const SITE = {
  name: 'Free SAT Math',
  description:
    'Free SAT Math practice for every skill, at three difficulty levels, with step-by-step solutions. No sign-up.',
  disclaimer:
    'SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this site.',
} as const;

/** Desmos' public demo key. Their docs allow it for development only. */
export const DESMOS_DEMO_KEY = 'dcb31709b452b1cf9dc26972add0fda6';

/**
 * The Desmos key for this build: DESMOS_API_KEY if set, the demo key in `astro dev`, otherwise null
 * (the calculator falls back to a link). Read it in .astro files and pass it to islands as a prop.
 */
export function desmosApiKey(): string | null {
  const key = import.meta.env.DESMOS_API_KEY;
  if (typeof key === 'string' && key !== '') return key;
  return import.meta.env.DEV ? DESMOS_DEMO_KEY : null;
}
