// Tiny synthesized sound effects for aura reactions. No audio files: everything is made with Web Audio.
// Kept quiet and short (under about a second) and played only after a persona finishes talking.

let ctx = null;
const MASTER = 0.22;

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(c, { type = 'sine', freq, to, start = 0, dur = 0.2, gain = 1, lowpass }) {
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(MASTER * gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    osc.connect(f);
    node = f;
  }
  node.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(c, { start = 0, dur = 0.3, gain = 1, from = 400, to = 3000, q = 1.2 }) {
  const t0 = c.currentTime + start;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(MASTER * gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

// Each effect returns how long it lasts in milliseconds.
const HYPE = [
  // double ding
  (c) => { tone(c, { freq: 1318, dur: 0.22 }); tone(c, { freq: 1760, start: 0.12, dur: 0.4, gain: 0.9 }); return 560; },
  // level up arpeggio
  (c) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, { type: 'triangle', freq: f, start: i * 0.08, dur: 0.22, gain: 0.9 })); return 560; },
  // sparkle
  (c) => { [2093, 2637, 3136, 2349].forEach((f, i) => tone(c, { freq: f, start: i * 0.06, dur: 0.18, gain: 0.55 })); return 480; },
  // coin pickup
  (c) => { tone(c, { type: 'square', freq: 988, dur: 0.09, gain: 0.5 }); tone(c, { type: 'square', freq: 1319, start: 0.09, dur: 0.32, gain: 0.5 }); return 480; },
];

const ROAST = [
  // sad trombone
  (c) => {
    [[392, 0], [370, 0.22], [349, 0.44]].forEach(([f, s]) => tone(c, { type: 'sawtooth', freq: f, start: s, dur: 0.2, gain: 0.7, lowpass: 900 }));
    tone(c, { type: 'sawtooth', freq: 330, to: 262, start: 0.66, dur: 0.5, gain: 0.7, lowpass: 900 });
    return 1250;
  },
  // wrong answer buzzer
  (c) => { tone(c, { type: 'square', freq: 140, dur: 0.45, gain: 0.55, lowpass: 700 }); return 550; },
  // boom
  (c) => { tone(c, { freq: 90, to: 38, dur: 0.6, gain: 1.4 }); noise(c, { dur: 0.12, gain: 0.5, from: 800, to: 200 }); return 700; },
  // record scratch
  (c) => { noise(c, { dur: 0.35, gain: 0.9, from: 600, to: 5000, q: 2 }); return 450; },
  // womp womp
  (c) => { tone(c, { type: 'triangle', freq: 220, to: 160, dur: 0.28, gain: 1 }); tone(c, { type: 'triangle', freq: 196, to: 120, start: 0.32, dur: 0.5, gain: 1 }); return 900; },
];

let lastIdx = { hype: -1, roast: -1 };

/** Play a random effect of the given kind ('hype' | 'roast'), never the same one twice in a row. */
export function playSfx(kind) {
  try {
    const c = audio();
    if (!c) return 0;
    const pool = kind === 'hype' ? HYPE : ROAST;
    let i = Math.floor(Math.random() * pool.length);
    if (i === lastIdx[kind]) i = (i + 1) % pool.length;
    lastIdx[kind] = i;
    return pool[i](c);
  } catch {
    return 0;
  }
}

/** Call from a user gesture (the Join button) so the browser lets sounds play later. */
export function unlockSfx() {
  audio();
}
