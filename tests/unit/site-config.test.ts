import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESMOS_DEMO_KEY, SITE, desmosApiKey } from '../../src/site.config';

afterEach(() => vi.unstubAllEnvs());

describe('desmosApiKey', () => {
  it('uses DESMOS_API_KEY when set', () => {
    vi.stubEnv('DESMOS_API_KEY', 'real-key');
    expect(desmosApiKey()).toBe('real-key');
  });
  it('falls back to the demo key only in development', () => {
    vi.stubEnv('DESMOS_API_KEY', '');
    vi.stubEnv('DEV', true);
    expect(desmosApiKey()).toBe(DESMOS_DEMO_KEY);
    vi.stubEnv('DEV', false);
    expect(desmosApiKey()).toBeNull();
  });
});

describe('SITE', () => {
  it('carries the trademark disclaimer', () => {
    expect(SITE.disclaimer).toContain('not affiliated with');
  });
});
