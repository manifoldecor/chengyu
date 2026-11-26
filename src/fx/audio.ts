// Small WebAudio synth so the game has satisfying sound with no asset files.
let ctx: AudioContext | null = null;
const ac = () => { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; };

const tone = (freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0, slideTo?: number) => {
  const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
};

const noise = (dur: number, f0: number, f1: number, q: number, gain: number, delay = 0) => {
  const c = ac(), t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(c.destination); s.start(t);
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

export const sfx = {
  /** Rising whine that follows hold progress; call set(0..1) each frame, stop() on release. */
  chargeLoop() {
    const c = ac(), o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0.0001;
    o.connect(f).connect(g).connect(c.destination); o.start();
    return {
      set(p: number) {
        const t = c.currentTime;
        o.frequency.setTargetAtTime(110 + p * p * 520, t, 0.05);
        f.frequency.setTargetAtTime(500 + p * 3000, t, 0.05);
        g.gain.setTargetAtTime(p > 0.02 ? 0.02 + p * 0.07 : 0.0001, t, 0.05);
      },
      stop() { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.05); o.stop(c.currentTime + 0.3); },
    };
  },
  tear() { noise(0.35, 1200, 6000, 0.8, 0.5); noise(0.18, 3000, 9000, 1.5, 0.35, 0.05); tone(90, 0.3, 'sine', 0.3, 0, 40); },
  /** A talisman rips and burns: paper tear + low thud. */
  seal() { noise(0.28, 2500, 700, 1.0, 0.45); noise(0.5, 200, 1400, 0.7, 0.2, 0.05); tone(70, 0.35, 'sine', 0.3, 0, 38); },
  /** The pack shatters: heavy crack, falling glass, deep boom. */
  shatter() {
    noise(0.5, 900, 9000, 0.6, 0.6); noise(0.9, 120, 1200, 0.5, 0.35);
    tone(55, 1.4, 'sine', 0.5, 0, 28);
    for (let i = 0; i < 12; i++) tone(rnd(1800, 5200), rnd(0.2, 0.5), 'triangle', 0.035, rnd(0.02, 0.35));
  },
  whoosh() { noise(0.6, 300, 2500, 0.6, 0.25); },
  flip() { noise(0.25, 800, 3000, 1.2, 0.18); tone(300, 0.2, 'triangle', 0.08, 0, 700); },
  reveal(tier: number) {
    tone(110, 0.9, 'sine', 0.35, 0, 45);                              // sub thump
    noise(0.5, 400, 8000, 0.5, 0.25 + tier * 0.05);                  // burst
    const n = 3 + tier * 2;                                           // sparkle run gets longer with rarity
    for (let i = 0; i < n; i++) tone(PENTATONIC[Math.min(i + (tier > 2 ? 1 : 0), 7)] * (tier > 3 ? 1 : 0.5) , 0.6 + tier * 0.2, 'triangle', 0.09, i * 0.07);
    if (tier >= 2) tone(196, 1.2, 'sine', 0.12, 0.05);
    if (tier >= 3) { tone(65.4, 2.2, 'sine', 0.35, 0.05); tone(130.8, 2.0, 'triangle', 0.12, 0.05); } // gong body
    if (tier >= 4) for (let i = 0; i < 10; i++) tone(PENTATONIC[i % 8] * 2, 0.9, 'sine', 0.05, 0.4 + i * 0.06);
  },
  coin() { tone(1200, 0.08, 'square', 0.05); tone(1600, 0.14, 'square', 0.05, 0.06); },
};
export const haptic = (ms: number | number[]) => navigator.vibrate?.(ms);
