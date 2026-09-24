import { afterEach, describe, expect, it } from 'vitest';
import { THEME_KEY, getThemePref, setThemePref } from '../../src/lib/theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('theme preference', () => {
  it('defaults to system', () => {
    expect(getThemePref()).toBe('system');
  });
  it('saves and applies light or dark', () => {
    setThemePref('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(getThemePref()).toBe('dark');
  });
  it('system clears the saved choice', () => {
    setThemePref('light');
    setThemePref('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
  it('ignores junk in storage', () => {
    localStorage.setItem(THEME_KEY, 'purple');
    expect(getThemePref()).toBe('system');
  });
});
