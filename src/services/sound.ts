/** Sonidos sintetizados con Web Audio (sin archivos). Todo es opcional: si falla, no pasa nada. */
let ctx: AudioContext | null = null;

type AudioCtor = typeof AudioContext;

function getContext(): AudioContext | null {
  try {
    if (ctx) return ctx;
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Se llama dentro de un gesto del usuario: los navegadores recién ahí permiten audio. */
export function unlockAudio(): void {
  try {
    const c = getContext();
    if (c && c.state === 'suspended') void c.resume().catch(() => {});
  } catch {
    /* audio bloqueado */
  }
}

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number): void {
  const c = getContext();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** "Pop" corto al salir una bolilla (~150 ms). */
export function playPop(): void {
  try {
    unlockAudio();
    tone(520, 0, 0.15, 0.25, 'sine', 880);
  } catch {
    /* ignorar */
  }
}

/** Arpegio alegre cuando salió el último número. */
export function playFinish(): void {
  try {
    unlockAudio();
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, 0.22, 'triangle'));
  } catch {
    /* ignorar */
  }
}

/** Tono grave y corto al deshacer. */
export function playUndo(): void {
  try {
    unlockAudio();
    tone(440, 0, 0.14, 0.2, 'sine', 260);
  } catch {
    /* ignorar */
  }
}
