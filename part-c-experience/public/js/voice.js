// Part A hook (Voice Studio). The real module is Part A's player.js, served by Part A's server and loaded
// at runtime with a dynamic import from the origin the hub reports in /api/config (VOICE_URL).
// If VOICE_URL is unset, or the import fails, this stays in a text-only stub state and the app still works.
//
// Part A's API (part_a_voice/player.js):
//   playDebate(script, {baseUrl, onEvent, signal}) -> Promise<{finished}>
//   transcribePitch({onInterim}) -> Promise<string>

export class VoiceUnavailableError extends Error {
  constructor(message = 'Voice is not connected. Type your pitch instead.') {
    super(message);
    this.name = 'VoiceUnavailableError';
    this.code = 'VOICE_UNAVAILABLE';
  }
}

const stubAdapter = {
  available: false,
  async playDebate() {
    return { finished: false };
  },
  async transcribePitch() {
    throw new VoiceUnavailableError();
  },
  stopAll() {},
};

let adapter = stubAdapter;

export function setVoiceAdapter(next) {
  adapter = next ?? stubAdapter;
}

export function isVoiceAvailable() {
  return Boolean(adapter.available);
}

// player.js makes `new Audio()` elements it never hands back. Track them so "Start over" can really stop sound.
const tracked = new Set();
function trackAudioElements() {
  if (globalThis.Audio?.__tracked) return;
  const Original = globalThis.Audio;
  if (typeof Original !== 'function') return;
  function TrackedAudio(...args) {
    const el = new Original(...args);
    tracked.add(el);
    return el;
  }
  TrackedAudio.prototype = Original.prototype;
  TrackedAudio.__tracked = true;
  globalThis.Audio = TrackedAudio;
}

/**
 * Load Part A's player from `${voiceUrl}/player.js`. Resolves true when voice is ready, false otherwise.
 * Never throws.
 */
export async function initVoice(voiceUrl) {
  if (!voiceUrl) return false;
  try {
    trackAudioElements();
    const mod = await import(/* @vite-ignore */ `${voiceUrl}/player.js`);
    if (typeof mod.playDebate !== 'function' || typeof mod.transcribePitch !== 'function') throw new Error('player.js has the wrong shape');
    setVoiceAdapter({
      available: true,
      baseUrl: voiceUrl,
      playDebate: (script, opts = {}) => mod.playDebate(script, { ...opts, baseUrl: voiceUrl }),
      transcribePitch: (opts) => mod.transcribePitch(opts),
      stopAll() {
        for (const el of tracked) { try { el.pause(); } catch { /* ignore */ } }
        tracked.clear();
        try { globalThis.speechSynthesis?.cancel(); } catch { /* ignore */ }
      },
    });
    return true;
  } catch (err) {
    console.warn('Voice module not loaded, staying text-only:', err?.message ?? err);
    setVoiceAdapter(null);
    return false;
  }
}

/** Call from a click handler. Browsers only let audio play after a user gesture. */
export function unlockAudio() {
  try {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctx.resume?.();
    setTimeout(() => ctx.close?.(), 500);
  } catch { /* not fatal */ }
}

export function playDebate(script, opts) {
  return adapter.playDebate(script, opts);
}

export function transcribePitch(opts) {
  return adapter.transcribePitch(opts);
}

export function stopVoice() {
  adapter.stopAll?.();
}
