import type { SfxName } from "./types";

/** Built-in sound effects, synthesized on the fly (no external files / licenses needed). */
export const SFX_INFO: Record<SfxName, { label: string; duration: number }> = {
  whoosh: { label: "Whoosh (transición)", duration: 0.7 },
  pop: { label: "Pop", duration: 0.18 },
  ding: { label: "Ding (notificación)", duration: 1.2 },
  boom: { label: "Boom (impacto)", duration: 1.4 },
  click: { label: "Click", duration: 0.06 },
  riser: { label: "Riser (tensión)", duration: 1.6 },
  tada: { label: "Ta-da (logro)", duration: 1.2 },
  buzzer: { label: "Error / buzzer", duration: 0.5 },
  glitch: { label: "Glitch digital", duration: 0.45 },
  bubble: { label: "Burbuja", duration: 0.25 },
};

const SR = 44100;

function noiseBuffer(ctx: BaseAudioContext, dur: number) {
  const b = ctx.createBuffer(1, Math.ceil(dur * SR), SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(ctx: BaseAudioContext, t0: number, attack: number, dur: number, peak = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  return g;
}

function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  t0: number,
  dur: number,
  peak = 0.5,
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = env(ctx, t0, 0.005, dur, peak);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(
  ctx: BaseAudioContext,
  out: AudioNode,
  t0: number,
  dur: number,
  filter: BiquadFilterType,
  f0: number,
  f1: number,
  peak = 0.6,
  attack = 0.01,
) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);
  const bq = ctx.createBiquadFilter();
  bq.type = filter;
  bq.Q.value = 1.2;
  bq.frequency.setValueAtTime(f0, t0);
  bq.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = env(ctx, t0, attack, dur, peak);
  src.connect(bq).connect(g).connect(out);
  src.start(t0);
}

const cache = new Map<SfxName, Promise<AudioBuffer>>();

export function sfxBuffer(name: SfxName): Promise<AudioBuffer> {
  let p = cache.get(name);
  if (!p) {
    p = renderSfx(name);
    cache.set(name, p);
  }
  return p;
}

async function renderSfx(name: SfxName): Promise<AudioBuffer> {
  const dur = SFX_INFO[name].duration + 0.1;
  const ctx = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
  const out = ctx.destination;
  switch (name) {
    case "whoosh":
      noise(ctx, out, 0, 0.7, "bandpass", 300, 3500, 0.9, 0.3);
      break;
    case "pop":
      tone(ctx, out, "sine", 900, 180, 0, 0.15, 0.8);
      break;
    case "ding":
      tone(ctx, out, "sine", 1318, 1318, 0, 1.2, 0.5);
      tone(ctx, out, "sine", 2636, 2636, 0, 0.6, 0.15);
      break;
    case "boom":
      tone(ctx, out, "sine", 120, 35, 0, 1.3, 1);
      noise(ctx, out, 0, 0.5, "lowpass", 1200, 100, 0.6);
      break;
    case "click":
      noise(ctx, out, 0, 0.05, "highpass", 3000, 2000, 0.8, 0.001);
      break;
    case "riser":
      noise(ctx, out, 0, 1.6, "bandpass", 200, 6000, 0.6, 1.4);
      tone(ctx, out, "sawtooth", 110, 880, 0, 1.6, 0.08);
      break;
    case "tada":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(ctx, out, "triangle", f, f, i * 0.09, 1.1 - i * 0.09, 0.3),
      );
      break;
    case "buzzer":
      tone(ctx, out, "square", 150, 140, 0, 0.45, 0.25);
      tone(ctx, out, "square", 155, 145, 0, 0.45, 0.25);
      break;
    case "glitch":
      for (let i = 0; i < 7; i++) {
        const t = i * 0.06;
        tone(ctx, out, "square", 200 + Math.random() * 1800, 100 + Math.random() * 900, t, 0.05, 0.25);
      }
      break;
    case "bubble":
      tone(ctx, out, "sine", 300, 1400, 0, 0.2, 0.6);
      break;
  }
  return ctx.startRendering();
}
