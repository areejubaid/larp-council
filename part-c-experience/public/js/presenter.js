// Presentation queue. Events can arrive in a burst (the real Brain emits fast, and voice mode publishes
// everything at once), but the UI shows lines one at a time. DOM free, with injectable timers, so it is
// unit tested from Node.
//
// Two modes:
//   timed  every line is held for a mock speaking time based on its text length.
//   audio  Part A's player sets the pace. A line, and the beats that belong to it, wait for the player's
//          audio_started signal for that lineId; the verdict waits for playDebate to finish. If the player
//          fails, or goes quiet for too long (watchdog), the presenter drops to timed mode for the rest of
//          the debate, so the debate always finishes.
import { lineDuration } from './text.js';
import { CLAP_SILENCE_MS, VERDICT_GAP_MS } from './constants.js';

export const WATCHDOG_FIRST_MS = 60000;   // prefetching every line can be slow, especially with real TTS
export const WATCHDOG_BETWEEN_MS = 30000;

/**
 * handlers:
 *   onSilence(on)               slow clap in timed mode: everyone goes quiet
 *   onLineStart(line)           show the line, start the waveform
 *   onLineEnd(line, {cutOff})   stop the waveform
 *   onBeat(event, {audio})      interruption, rage_quit, slow_clap, character_scored
 *   onVerdict(event)
 *   onFallback(reason)          audio mode gave up and timed mode took over
 */
export function createPresenter(handlers, {
  speed = 1, audio = false, setTimer = setTimeout, clearTimer = clearTimeout,
  watchdogFirstMs = WATCHDOG_FIRST_MS, watchdogBetweenMs = WATCHDOG_BETWEEN_MS,
} = {}) {
  const queue = [];
  let mode = audio ? 'audio' : 'timed';
  let current = null;        // line being spoken
  let timer = null;
  let busy = false;          // a timed line, a silence, or a verdict gap is holding the queue
  let epoch = 0;
  let watchdog = null;
  let audioRunning = false;
  let audioDone = false;
  const clappedLines = new Set();
  const started = new Set();     // lineIds the player has started
  const beatSignals = new Set(); // `${type}:${lineId}` the player has reported

  const wait = (ms, fn) => {
    const my = epoch;
    timer = setTimer(() => { timer = null; if (my === epoch) fn(); }, Math.max(0, ms / speed));
  };

  function disarm() {
    clearTimer(watchdog);
    watchdog = null;
  }
  function arm(ms) {
    disarm();
    if (mode !== 'audio' || !audioRunning) return;
    const my = epoch;
    watchdog = setTimer(() => { if (my === epoch) fallback('watchdog'); }, ms);
  }

  function fallback(reason) {
    if (mode !== 'audio') return;
    mode = 'timed';
    disarm();
    handlers.onFallback?.(reason);
    pump();
  }

  function finishLine(cutOff) {
    if (!current) return;
    const line = current;
    current = null;
    handlers.onLineEnd?.(line, { cutOff });
  }

  function startLine(line) {
    const cutOff = mode === 'audio' && current && line.interruptsLineId === current.lineId;
    if (cutOff) { const prev = current; current = null; handlers.onLineEnd?.(prev, { cutOff: true }); } else finishLine(false);
    handlers.onLineStart?.(line);
    current = line;
    if (mode === 'timed') {
      busy = true;
      wait(lineDuration(line.text) * 0.97, () => { finishLine(false); busy = false; pump(); });
    }
  }

  function gateOpen(item) {
    if (mode === 'timed') return true;
    const e = item.event;
    if (item.kind === 'line') return started.has(e.payload.lineId);
    if (item.kind === 'verdict') return audioDone;
    if (item.kind === 'beat') {
      const id = e.payload?.lineId;
      if (e.type === 'interruption') return started.has(id);
      if (e.type === 'rage_quit' || e.type === 'slow_clap') return beatSignals.has(`${e.type}:${id}`);
    }
    return true;
  }

  function pump() {
    while (!busy && queue.length) {
      const item = queue[0];
      if (!gateOpen(item)) return;
      queue.shift();
      if (item.kind === 'beat') {
        const e = item.event;
        if (e.type === 'slow_clap' && e.payload?.lineId && clappedLines.has(e.payload.lineId)) continue;
        // The player reports these after the line's audio has ended.
        if (mode === 'audio' && (e.type === 'rage_quit' || e.type === 'slow_clap')) finishLine(false);
        handlers.onBeat?.(e, { audio: mode === 'audio' });
      } else if (item.kind === 'verdict') {
        finishLine(false);
        busy = true;
        wait(VERDICT_GAP_MS, () => { busy = false; handlers.onVerdict?.(item.event); pump(); });
      } else if (item.kind === 'line') {
        const line = item.event.payload;
        if (mode === 'timed' && line.principleId === 'slow_clap') {
          clappedLines.add(line.lineId);
          busy = true;
          finishLine(false);
          handlers.onSilence?.(true);
          wait(CLAP_SILENCE_MS, () => { handlers.onSilence?.(false); busy = false; startLine(line); });
        } else {
          startLine(line);
        }
      }
    }
  }

  return {
    pushLine(event) {
      const line = event.payload;
      // Timed mode: an interrupting line cuts the one on screen immediately, unless items are already waiting.
      if (mode === 'timed' && current && !queue.length && line.interruptsLineId && line.interruptsLineId === current.lineId && line.principleId !== 'slow_clap') {
        clearTimer(timer);
        timer = null;
        finishLine(true);
        busy = false;
      }
      queue.push({ kind: 'line', event });
      pump();
    },
    pushBeat(event) {
      // Timed mode: an interruption is logged the moment its line is on screen, not after it finishes.
      if (mode === 'timed' && event.type === 'interruption' && current && current.lineId === event.payload?.lineId && !queue.length) {
        handlers.onBeat?.(event, { audio: false });
        return;
      }
      queue.push({ kind: 'beat', event });
      pump();
    },
    pushVerdict(event) { queue.push({ kind: 'verdict', event }); pump(); },

    // ----- audio mode signals (from toTimingSignal) -----
    /** playDebate was called: start the watchdog. */
    audioStarting() { audioRunning = true; arm(watchdogFirstMs); },
    audioStarted(lineId) { started.add(lineId); arm(watchdogBetweenMs); pump(); },
    audioBeat(type, lineId) { beatSignals.add(`${type}:${lineId}`); arm(watchdogBetweenMs); pump(); },
    /** playDebate settled. ok = resolved with finished true. Anything else drops to timed mode. */
    audioEnded(ok) {
      disarm();
      audioRunning = false;
      audioDone = true;
      if (mode !== 'audio') return;
      if (!ok) return fallback('player-failed');
      pump();
      finishLine(false);
      // The player says it is done but some items never got their signal: release them on a timer.
      if (queue.length && !busy) fallback('missing-signals');
    },
    /** Give up on audio for this session (no script, no voice module, user aborted). */
    abandonAudio(reason = 'no-audio') { disarm(); audioRunning = false; fallback(reason); },

    reset() {
      epoch += 1;
      clearTimer(timer);
      disarm();
      timer = null;
      queue.length = 0;
      current = null;
      busy = false;
      audioRunning = false;
      audioDone = false;
      clappedLines.clear();
      started.clear();
      beatSignals.clear();
    },
    get mode() { return mode; },
    get pending() { return queue.length + (busy ? 1 : 0); },
  };
}
