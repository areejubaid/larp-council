// Voice Studio browser module (Part A).
// Public API (this is the only thing Part C needs to import):
//
//   import { playDebate, transcribePitch } from "./player.js";
//   await playDebate(script, { baseUrl: "http://localhost:8787", onEvent: (e) => hub.send(e) });
//   const pitchText = await transcribePitch();
//
// script  is a DebateScript (contract version 1).
// onEvent receives Event objects (contract version 1) with these types:
//   line_ready, audio_started, interruption, rage_quit, slow_clap, verdict_ready
//
// Moods this module reacts to on a DebateLine:
//   "rage_quit"  plays a door slam after the line and emits rage_quit
//   "slow_clap"  plays a slow clap after the line and emits slow_clap

const DEFAULTS = {
  baseUrl: "", // where server.mjs lives, empty means same origin
  onEvent: () => {},
  interruptAt: 0.55, // fraction of a line that plays before an interrupter cuts in
  fadeMs: 180,
  gapMs: 250, // pause between lines that are not interruptions
  signal: undefined, // optional AbortSignal to stop playback
};

function makeEvent(script, type, payload) {
  return {
    version: 1,
    sessionId: script.sessionId,
    ts: Math.floor(Date.now() / 1000),
    type,
    payload,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAudioUrl(line, baseUrl) {
  const res = await fetch(`${baseUrl}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mindId: line.mindId, text: line.text }),
  });
  if (!res.ok) throw new Error(`tts failed ${res.status}`);
  const data = await res.json();
  return `${baseUrl}${data.url}`;
}

function loadAudio(url) {
  return new Promise((resolve, reject) => {
    const el = new Audio();
    el.preload = "auto";
    el.addEventListener("loadedmetadata", () => resolve(el), { once: true });
    el.addEventListener("error", () => reject(new Error("audio load error")), { once: true });
    el.src = url;
  });
}

// Last resort if the server and cache are both unreachable: the browser's own voice.
function speakFallback(line) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(line.text.replace(/\[[^\]]*\]/g, ""));
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

function fadeOut(el, ms) {
  const start = el.volume;
  const steps = 12;
  return new Promise((resolve) => {
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      el.volume = Math.max(0, start * (1 - i / steps));
      if (i >= steps) {
        clearInterval(t);
        el.pause();
        resolve();
      }
    }, ms / steps);
  });
}

// Small WebAudio sound effects so we do not depend on any audio files.
let ctx;
function audioCtx() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function noiseBurst(when, dur, gainValue, lowpassHz) {
  const c = audioCtx();
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpassHz;
  const gain = c.createGain();
  gain.gain.value = gainValue;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(c.currentTime + when);
}

export async function slowClap() {
  // Claps start far apart and speed up, like a grudging crowd.
  const gaps = [900, 800, 650, 500, 380, 280, 200, 150, 120, 100, 90, 80];
  let t = 0;
  for (const g of gaps) {
    noiseBurst(t / 1000, 0.09, 0.7, 4500);
    t += g;
  }
  await sleep(t + 200);
}

export async function doorSlam() {
  noiseBurst(0, 0.35, 1.0, 600);
  noiseBurst(0.04, 0.15, 0.6, 2000);
  await sleep(450);
}

export async function playDebate(script, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const emit = (type, payload) => opts.onEvent(makeEvent(script, type, payload));
  const aborted = () => opts.signal && opts.signal.aborted;

  // 1) Prefetch every line in parallel so playback never stalls mid debate.
  const loaded = await Promise.all(
    script.lines.map(async (line) => {
      try {
        const url = await fetchAudioUrl(line, opts.baseUrl);
        const el = await loadAudio(url);
        emit("line_ready", { lineId: line.lineId, mindId: line.mindId, cached: true });
        return { line, el };
      } catch (err) {
        emit("line_ready", { lineId: line.lineId, mindId: line.mindId, fallback: "browser_voice" });
        return { line, el: null };
      }
    })
  );

  // 2) Play in order, cutting a line short when the next line interrupts it.
  let current = null; // { line, el } that is playing right now
  for (let i = 0; i < loaded.length; i++) {
    if (aborted()) break;
    const { line, el } = loaded[i];
    const interruptedPrev =
      current && line.interruptsLineId && current.line.lineId === line.interruptsLineId;

    if (interruptedPrev) {
      // The previous line is still playing. Fade it out under this one.
      emit("interruption", { lineId: line.lineId, interruptedLineId: current.line.lineId, mindId: line.mindId });
      if (current.el) fadeOut(current.el, opts.fadeMs);
    } else if (current && current.el && !current.el.ended) {
      await new Promise((r) => current.el.addEventListener("ended", r, { once: true }));
    }

    emit("audio_started", { lineId: line.lineId, mindId: line.mindId, mood: line.mood, text: line.text });

    const next = loaded[i + 1];
    const nextInterrupts = next && next.line.interruptsLineId === line.lineId;

    if (!el) {
      await speakFallback(line);
      current = null;
    } else {
      el.volume = 1;
      await el.play();
      current = { line, el };
      if (nextInterrupts) {
        // Wait until the line is partway through, then loop around so the next line cuts in.
        const cutAt = el.duration * opts.interruptAt * 1000;
        await sleep(cutAt);
        continue;
      }
      await new Promise((r) => el.addEventListener("ended", r, { once: true }));
      current = null;
    }

    if (line.mood === "rage_quit") {
      emit("rage_quit", { lineId: line.lineId, mindId: line.mindId });
      await doorSlam();
    } else if (line.mood === "slow_clap") {
      emit("slow_clap", { lineId: line.lineId, mindId: line.mindId });
      await slowClap();
    }
    if (!nextInterrupts) await sleep(opts.gapMs);
  }

  // Let any trailing interrupter finish.
  if (current && current.el && !current.el.ended) {
    await new Promise((r) => current.el.addEventListener("ended", r, { once: true }));
  }

  if (script.verdict) emit("verdict_ready", { verdict: script.verdict, characterScore: script.characterScore });
  return { finished: !aborted() };
}

// Speech to text for the player's pitch using the browser Web Speech API (Chrome and Edge).
// Resolves with the final transcript. Rejects if the browser has no support or mic is blocked.
export function transcribePitch({ lang = "en-US", onInterim = () => {}, maxMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return reject(new Error("Speech recognition is not supported in this browser. Use Chrome, or type the pitch."));
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    const timer = setTimeout(() => rec.stop(), maxMs);
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      onInterim((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(`Mic error: ${e.error}`));
    };
    rec.onend = () => {
      clearTimeout(timer);
      resolve(finalText.trim());
    };
    rec.start();
  });
}
