import { startingLevel } from '../engine/practice';
import { LEVEL_NAME } from '../lib/labels';
import { updateSettings } from '../store/progress';
import { getProgressStore, useProgress } from '../store/progress-store';

export const TARGET_OPTIONS: readonly number[] = Array.from({ length: 61 }, (_, i) => 200 + i * 10);

export default function TargetScoreSelect({ id }: { id: string }) {
  const { progress } = useProgress();
  const target = progress.settings.targetScore;
  return (
    <div className="field">
      <label htmlFor={id}>Your target SAT Math score</label>
      <select
        id={id}
        value={target ?? ''}
        onChange={(e) => {
          const value = e.target.value === '' ? null : Number(e.target.value);
          getProgressStore().update((p) => updateSettings(p, { targetScore: value }));
        }}
      >
        <option value="">Not set</option>
        {TARGET_OPTIONS.map((score) => (
          <option key={score} value={score}>
            {score}
          </option>
        ))}
      </select>
      <p className="hint">
        Practice starts at <strong>{LEVEL_NAME[startingLevel(target)]}</strong> and adjusts as you
        go.
      </p>
    </div>
  );
}
