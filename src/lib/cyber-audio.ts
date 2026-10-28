/**
 * Small Web Audio helper for the cyber scan / signal sounds.
 * The AudioContext is created lazily inside a user gesture (button click),
 * so browsers never block it and nothing plays on page load.
 */

type AudioContextCtor = typeof AudioContext;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedContext) return sharedContext;

  const ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;

  if (!ctor) return null;

  try {
    sharedContext = new ctor();
  } catch {
    return null;
  }

  return sharedContext;
}

function rampGain(ctx: AudioContext, gain: GainNode, from: number, to: number, at: number) {
  gain.gain.setValueAtTime(from, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(to, 0.0001), at + 0.05);
}

/** Rising sweep plus rhythmic chirps while the scan overlay is running. */
export function playScanSound(durationMs = 1400): () => void {
  const ctx = getAudioContext();
  if (!ctx) return () => {};

  void ctx.resume();

  const start = ctx.currentTime;
  const seconds = durationMs / 1000;
  const end = start + seconds;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.12, start + 0.06);
  master.gain.setValueAtTime(0.12, Math.max(end - 0.2, start + 0.1));
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  master.connect(ctx.destination);

  const sweep = ctx.createOscillator();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(190, start);
  sweep.frequency.exponentialRampToValueAtTime(1600, Math.max(end - 0.08, start + 0.2));

  const sweepGain = ctx.createGain();
  sweepGain.gain.setValueAtTime(0.045, start);
  sweep.connect(sweepGain).connect(master);
  sweep.start(start);
  sweep.stop(end);

  for (let i = 0; i * 0.24 < seconds - 0.08; i += 1) {
    const at = start + i * 0.24;
    const chirp = ctx.createOscillator();
    chirp.type = "square";
    chirp.frequency.setValueAtTime(860 + i * 150, at);

    const chirpGain = ctx.createGain();
    chirpGain.gain.setValueAtTime(0.0001, at);
    chirpGain.gain.exponentialRampToValueAtTime(0.075, at + 0.012);
    chirpGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);

    chirp.connect(chirpGain).connect(master);
    chirp.start(at);
    chirp.stop(at + 0.12);
  }

  return () => {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    } catch {
      /* the context may already be closed; nothing to do */
    }
  };
}

/** Short confirming chime: rising notes for CALL, falling notes for PUT. */
export function playSignalSound(up: boolean) {
  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume();

  const now = ctx.currentTime;
  const notes = up ? [523.25, 783.99, 1046.5] : [523.25, 392, 261.63];

  notes.forEach((frequency, index) => {
    const at = now + index * 0.085;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, at);

    const gain = ctx.createGain();
    rampGain(ctx, gain, 0.0001, 0.11, at);
    gain.gain.setValueAtTime(0.11, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(4200, at);

    osc.connect(gain).connect(filter).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.36);
  });
}
