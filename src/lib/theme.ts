export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_KEY = 'fsm.theme';

export function getThemePref(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Saves the preference (if storage works) and applies it to <html data-theme>. */
export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  if (pref === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = pref;
}
