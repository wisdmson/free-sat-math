/** Vibration and sound for Quick Play answers. Both optional, both fail silently (spec §2.1). */
let audio: AudioContext | null = null;

function tones(freqs: readonly number[]): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx === undefined) return;
    audio ??= new Ctx();
    const ctx = audio;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.09;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.13);
    });
  } catch {
    // Audio unavailable: play silently.
  }
}

export function answerFeedback(
  correct: boolean,
  settings: { sound: boolean; haptics: boolean },
): void {
  if (correct && settings.haptics && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(20);
    } catch {
      // Not supported (e.g. iPhone): nothing happens.
    }
  }
  if (settings.sound) tones(correct ? [660, 880] : [220]);
}

export function levelUpFeedback(settings: { sound: boolean }): void {
  if (settings.sound) tones([523, 659, 784]);
}
