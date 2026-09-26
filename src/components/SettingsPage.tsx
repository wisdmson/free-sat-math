import { useState } from 'react';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';
import {
  emptyProgress,
  exportFileName,
  exportProgress,
  parseImport,
  updateSettings,
} from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';
import type { Progress } from '../store/schema';
import StorageBanner from './StorageBanner';
import TargetScoreSelect from './TargetScoreSelect';

type Pending = {
  progress: Progress;
  summary: { attempts: number; tests: number; bookmarks: number };
};

export default function SettingsPage() {
  const snapshot = useProgress();
  const { settings } = snapshot.progress;
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState('');
  const store = getProgressStore();

  const download = () => {
    const blob = new Blob([exportProgress(snapshot.progress)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = exportFileName(new Date());
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage('Progress file downloaded.');
  };

  const chooseFile = async (file: File | undefined) => {
    if (file === undefined) return;
    const result = parseImport(await file.text());
    if (result.ok) {
      setPending({ progress: result.progress, summary: result.summary });
      setMessage('');
    } else {
      setPending(null);
      setMessage(result.reason);
    }
  };

  return (
    <div className="settings">
      <StorageBanner snapshot={snapshot} />

      <section aria-labelledby="goal-heading">
        <h2 id="goal-heading">Goal</h2>
        <TargetScoreSelect id="settings-target" />
      </section>

      <section aria-labelledby="timing-heading">
        <h2 id="timing-heading">Practice test timing</h2>
        <fieldset>
          <legend>Time per module</legend>
          {([1, 1.5, 2] as const).map((m) => (
            <label key={m} className="inline-option">
              <input
                type="radio"
                name="time-multiplier"
                checked={settings.timeMultiplier === m}
                onChange={() => store.update((p) => updateSettings(p, { timeMultiplier: m }))}
              />
              {m === 1 ? 'Standard' : `${m}× (extended time)`}
            </label>
          ))}
        </fieldset>
        <label className="inline-option">
          <input
            type="checkbox"
            checked={settings.untimed}
            onChange={(e) => store.update((p) => updateSettings(p, { untimed: e.target.checked }))}
          />
          Untimed practice tests
        </label>
      </section>

      <section aria-labelledby="theme-heading">
        <h2 id="theme-heading">Theme</h2>
        <div className="field">
          <label htmlFor="theme">Color theme</label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => {
              const pref = e.target.value as ThemePref;
              setThemePref(pref);
              setTheme(pref);
            }}
          >
            <option value="system">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </section>

      <section aria-labelledby="data-heading">
        <h2 id="data-heading">Your data</h2>
        <p>
          Your progress is stored only in this browser. To move it to another device, download it
          here and import it there.
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={download}>
            Download progress
          </button>
          <label className="button">
            Import progress file
            <input
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(e) => {
                void chooseFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="button danger" onClick={() => setConfirmReset(true)}>
            Reset progress…
          </button>
        </div>

        {pending !== null && (
          <div className="confirm" role="group" aria-label="Confirm import">
            <p>
              Replace your current progress with this file? It has {pending.summary.attempts}{' '}
              answered problems, {pending.summary.bookmarks} bookmarks and {pending.summary.tests}{' '}
              practice tests. Your current progress is backed up in this browser first.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  store.replace(pending.progress);
                  setPending(null);
                  setMessage('Progress imported.');
                }}
              >
                Replace my progress
              </button>
              <button type="button" className="button" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {confirmReset && (
          <div className="confirm" role="group" aria-label="Confirm reset">
            <p>
              This clears your answers, bookmarks and settings. A backup is kept in this browser.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  store.replace(emptyProgress());
                  setConfirmReset(false);
                  setMessage('Progress reset.');
                }}
              >
                Reset
              </button>
              <button type="button" className="button" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <p role="status" aria-live="polite" className="status-line">
          {message}
        </p>
      </section>
    </div>
  );
}
