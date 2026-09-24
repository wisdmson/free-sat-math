import { afterEach, describe, expect, it, vi } from 'vitest';
import { url } from '../../src/lib/paths';

afterEach(() => vi.unstubAllEnvs());

describe('url', () => {
  it('leaves paths alone at the root', () => {
    vi.stubEnv('BASE_URL', '/');
    expect(url('/skills/')).toBe('/skills/');
  });
  it('prefixes the base path, with or without a trailing slash on the base', () => {
    vi.stubEnv('BASE_URL', '/sat-math/');
    expect(url('/skills/')).toBe('/sat-math/skills/');
    vi.stubEnv('BASE_URL', '/sat-math');
    expect(url('review/')).toBe('/sat-math/review/');
  });
});
