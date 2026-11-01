// Demo mode: replays a mock event file into a session with human pacing.
// Mock files have identical ts on every event, so pacing is derived from event type and text length.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SCENARIOS = Object.freeze(['bad', 'good', 'larp']);
const DEFAULT_MOCKS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mocks');

// Timing knobs in ms, before the REPLAY_SPEED divisor.
export const T = Object.freeze({
  first: 500, afterPitch: 1500, afterIdea: 700, moodGap: 600, beforeFirstLine: 1300,
  lineBase: 1000, linePerChar: 48, lineMin: 2400, lineMax: 6200,
  interruptCut: 0.3, interruptMax: 1200, companionDelay: 120, afterRageQuit: 900,
  beforeCharacter: 1200, beforeVerdict: 4600,
});

/** Strip bracketed audio tags like [deadpan]. Never mutates the input. */
export function stripTags(text) {
  return String(text).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function lineDuration(text) {
  const ms = T.lineBase + T.linePerChar * stripTags(text).length;
  return Math.min(T.lineMax, Math.max(T.lineMin, ms));
}

/**
 * Absolute offsets (ms from start, speed 1) for each event, in order.
 * Lines are paced by text length. A line that interrupts starts early, cutting the previous one off.
 * Companion events (interruption, slow_clap) fire just after their line; rage_quit fires when the line ends.
 */
export function schedule(events) {
  const offsets = [];
  let t = T.first;
  let lineStart = null;
  let lineEnd = null;
  let seenLine = false;
  let prevType = null;
  for (const e of events) {
    switch (e.type) {
      case 'pitch_received': t = T.first; break;
      case 'idea_scored': t += T.afterPitch; break;
      case 'mood_changed': t += prevType === 'idea_scored' ? T.afterIdea : T.moodGap; break;
      case 'line_ready': {
        const dur = lineDuration(e.payload?.text ?? '');
        if (!seenLine) {
          t += T.beforeFirstLine;
        } else if (e.payload?.interruptsLineId) {
          const natural = lineEnd - lineStart;
          t = lineStart + Math.min(T.interruptMax, Math.max(500, natural * T.interruptCut));
        } else {
          t = Math.max(t, lineEnd);
        }
        seenLine = true;
        lineStart = t;
        lineEnd = t + dur;
        break;
      }
      case 'interruption': case 'slow_clap': t = (lineStart ?? t) + T.companionDelay; break;
      case 'rage_quit': t = lineEnd ?? t; break;
      case 'character_scored': t = Math.max(t, lineEnd ?? t) + T.beforeCharacter; break;
      case 'verdict_ready': t = Math.max(t, lineEnd ?? t) + T.beforeVerdict; break;
      default: t += 300;
    }
    if (offsets.length && t < offsets[offsets.length - 1]) t = offsets[offsets.length - 1];
    if (e.type === 'rage_quit') lineEnd = t + T.afterRageQuit;
    offsets.push(Math.round(t));
    prevType = e.type;
  }
  return offsets;
}

export const MIND_IDS = Object.freeze(['perfectionist', 'engineer', 'operator']);

/** Mock file for a scenario. LARP has one mock per mind; unknown or missing minds use the perfectionist. */
export function mockName(scenario, chosenMindId) {
  if (!SCENARIOS.includes(scenario)) throw new Error(`unknown scenario ${JSON.stringify(scenario)}`);
  if (scenario !== 'larp') return scenario;
  return `larp-${MIND_IDS.includes(chosenMindId) ? chosenMindId : 'perfectionist'}`;
}

export function loadScenario(scenario, chosenMindId, mocksDir = DEFAULT_MOCKS_DIR) {
  return JSON.parse(readFileSync(path.join(mocksDir, `${mockName(scenario, chosenMindId)}.json`), 'utf8'));
}

/** Deep copies of the events with sessionId and ts rewritten. The source array is not touched. */
export function prepareEvents(events, sessionId, { nowSec = () => Math.floor(Date.now() / 1000) } = {}) {
  return events.map((src) => {
    const e = structuredClone(src);
    e.sessionId = sessionId;
    e.ts = nowSec();
    return e;
  });
}

export class ReplayManager {
  constructor(hub, { speed = 1, mocksDir = DEFAULT_MOCKS_DIR } = {}) {
    this.hub = hub;
    this.speed = speed > 0 ? speed : 1;
    this.mocksDir = mocksDir;
    /** @type {Map<string, {cancel: Function, done: Promise<void>}>} */
    this.active = new Map();
  }

  /** Replay a mock scenario into a session. See startEvents. */
  start(scenario, sessionId, { chosenMindId, voice = false } = {}) {
    const source = loadScenario(scenario, chosenMindId, this.mocksDir);
    return this.startEvents(source, sessionId, { voice, scenario });
  }

  /**
   * Replay any event array into a session, cancelling an existing replay for it.
   * Paced by type and text length, unless voice is true: then the voice player sets the pace,
   * so everything is published at once.
   */
  startEvents(sourceEvents, sessionId, { voice = false, scenario = 'events' } = {}) {
    this.cancel(sessionId);
    const events = prepareEvents(sourceEvents, sessionId);
    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });
    if (voice) {
      for (const e of events) this.hub.publish(sessionId, e);
      resolveDone();
      return { scenario, events, total: events.length, durationMs: 0, cancel() {}, done };
    }
    const offsets = schedule(sourceEvents).map((o) => o / this.speed);
    const begin = Date.now();
    let timer = null;
    let cancelled = false;
    let i = 0;
    const finish = () => {
      if (this.active.get(sessionId) === handle) this.active.delete(sessionId);
      resolveDone();
    };
    const tick = () => {
      if (cancelled) return;
      if (i >= events.length) return finish();
      const wait = Math.max(0, begin + offsets[i] - Date.now());
      timer = setTimeout(() => {
        if (cancelled) return;
        this.hub.publish(sessionId, events[i]);
        i += 1;
        tick();
      }, wait);
    };
    const handle = {
      scenario,
      events,
      total: events.length,
      durationMs: Math.round(offsets.at(-1) ?? 0),
      cancel: () => { cancelled = true; clearTimeout(timer); finish(); },
      done,
    };
    this.active.set(sessionId, handle);
    tick();
    return handle;
  }

  cancel(sessionId) {
    this.active.get(sessionId)?.cancel();
  }

  cancelAll() {
    for (const id of [...this.active.keys()]) this.cancel(id);
  }
}
