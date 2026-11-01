// Audio-driven presenter and Part A timing signals.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPresenter } from '../public/js/presenter.js';
import { toTimingSignal } from '../public/js/signals.js';

/** Presenter with a manual clock. */
function harness(opts = {}) {
  const log = [];
  let now = 0;
  const timers = [];
  const setTimer = (fn, ms) => { const t = { fn, at: now + ms, dead: false }; timers.push(t); return t; };
  const clearTimer = (t) => { if (t) t.dead = true; };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => !t.dead && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.dead = true;
      now = due.at;
      due.fn();
    }
    now = end;
  };
  const presenter = createPresenter({
    onSilence: (on) => log.push(`silence:${on}`),
    onLineStart: (l) => log.push(`start:${l.lineId}`),
    onLineEnd: (l, o) => log.push(`end:${l.lineId}${o.cutOff ? ':cut' : ''}`),
    onBeat: (e) => log.push(`beat:${e.type}`),
    onVerdict: () => log.push('verdict'),
    onFallback: (r) => log.push(`fallback:${r}`),
  }, { setTimer, clearTimer, ...opts });
  return { presenter, log, advance };
}
const lineEv = (lineId, extra = {}) => ({ type: 'line_ready', payload: { lineId, mindId: 'engineer', text: 'x'.repeat(60), principleId: 'p', ...extra } });
const VERDICT = { type: 'verdict_ready', payload: {} };

describe('timing signals from Part A player.js', () => {
  // Payload shapes emitted by part_a_voice/player.js. Most are not contract shapes.
  const player = (type, payload) => ({ version: 1, sessionId: 's', ts: 1, type, payload });

  test('only audio_started, rage_quit and slow_clap become timing signals', () => {
    assert.deepEqual(toTimingSignal(player('audio_started', { lineId: 'l1', mindId: 'engineer', text: 'x' })), { kind: 'audio_started', lineId: 'l1' });
    assert.deepEqual(toTimingSignal(player('rage_quit', { lineId: 'l6', mindId: 'operator' })), { kind: 'beat', type: 'rage_quit', lineId: 'l6' });
    assert.deepEqual(toTimingSignal(player('slow_clap', { lineId: 'l3', mindId: 'x' })), { kind: 'beat', type: 'slow_clap', lineId: 'l3' });
  });
  test('the non-contract shapes are ignored, so they never reach the dashboard or the hub', () => {
    assert.equal(toTimingSignal(player('line_ready', { lineId: 'l1', mindId: 'engineer', cached: true })), null);
    assert.equal(toTimingSignal(player('interruption', { lineId: 'l2', interruptedLineId: 'l1', mindId: 'engineer' })), null);
    assert.equal(toTimingSignal(player('verdict_ready', { verdict: { embarrassmentScore: 82 }, characterScore: 40 })), null);
    assert.equal(toTimingSignal(null), null);
    assert.equal(toTimingSignal(player('audio_started', {})), null);
  });
  test('a signal is a tiny value, never an event: no version, sessionId, ts or payload', () => {
    const sig = toTimingSignal(player('audio_started', { lineId: 'l1', mindId: 'e', text: 't', mood: 'm' }));
    assert.deepEqual(Object.keys(sig).sort(), ['kind', 'lineId']);
  });
  test('the browser code never posts player events anywhere', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
    // onEvent only feeds toTimingSignal; the only network calls are /api/pitch and /api/demo.
    assert.ok(!/\/events/.test(main), 'main.js must not post to /events');
    assert.match(main, /toTimingSignal\(playerEvent\)/);
  });
});

describe('presenter in audio mode', () => {
  test('a line is held until its audio_started; the waveform ends when the next line starts', () => {
    const { presenter, log } = harness({ audio: true });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l1'));
    presenter.pushLine(lineEv('l2'));
    assert.deepEqual(log, [], 'nothing shown before audio');
    presenter.audioStarted('l1');
    assert.deepEqual(log, ['start:l1']);
    presenter.audioStarted('l2');
    assert.deepEqual(log, ['start:l1', 'end:l1', 'start:l2']);
  });
  test('audio_started that arrives before the line event still releases it', () => {
    const { presenter, log } = harness({ audio: true });
    presenter.audioStarting();
    presenter.audioStarted('l1');
    presenter.pushLine(lineEv('l1'));
    assert.deepEqual(log, ['start:l1']);
  });
  test('an interrupting line cuts off the previous one when its audio starts, and its beat follows', () => {
    const { presenter, log } = harness({ audio: true });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l1'));
    presenter.pushLine(lineEv('l2', { interruptsLineId: 'l1' }));
    presenter.pushBeat({ type: 'interruption', payload: { lineId: 'l2', mindId: 'engineer', interruptsLineId: 'l1' } });
    presenter.audioStarted('l1');
    assert.deepEqual(log, ['start:l1']);
    presenter.audioStarted('l2');
    assert.deepEqual(log, ['start:l1', 'end:l1:cut', 'start:l2', 'beat:interruption']);
  });
  test('rage quit waits for the player beat signal and lands after the line', () => {
    const { presenter, log } = harness({ audio: true });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l6', { principleId: 'rage_quit' }));
    presenter.pushBeat({ type: 'rage_quit', payload: { lineId: 'l6', mindId: 'operator' } });
    presenter.audioStarted('l6');
    assert.deepEqual(log, ['start:l6']);
    presenter.audioBeat('rage_quit', 'l6');
    assert.deepEqual(log, ['start:l6', 'end:l6', 'beat:rage_quit']);
  });
  test('a slow clap line is plain in audio mode and the silence comes with the player beat', () => {
    const { presenter, log } = harness({ audio: true });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l9', { principleId: 'slow_clap' }));
    presenter.pushBeat({ type: 'slow_clap', payload: { lineId: 'l9', mindId: 'operator' } });
    presenter.audioStarted('l9');
    assert.deepEqual(log, ['start:l9']);
    presenter.audioBeat('slow_clap', 'l9');
    assert.deepEqual(log, ['start:l9', 'end:l9', 'beat:slow_clap']);
  });
  test('the verdict waits for playDebate to finish', () => {
    const { presenter, log, advance } = harness({ audio: true });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l1'));
    presenter.pushVerdict(VERDICT);
    presenter.audioStarted('l1');
    advance(10000);
    assert.ok(!log.includes('verdict'));
    presenter.audioEnded(true);
    advance(2000);
    assert.equal(log.at(-1), 'verdict');
    assert.ok(log.includes('end:l1'));
  });
  test('a rejected playDebate releases everything through the timed presenter', () => {
    const { presenter, log, advance } = harness({ audio: true });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l1'));
    presenter.pushLine(lineEv('l2'));
    presenter.pushVerdict(VERDICT);
    presenter.audioEnded(false);
    assert.equal(presenter.mode, 'timed');
    assert.equal(log[0], 'fallback:player-failed');
    advance(30000);
    assert.deepEqual(log.filter((x) => x.startsWith('start:') || x === 'verdict'), ['start:l1', 'start:l2', 'verdict']);
  });
  test('the watchdog fires when no audio_started arrives, and the debate still finishes', () => {
    const { presenter, log, advance } = harness({ audio: true, watchdogFirstMs: 5000, watchdogBetweenMs: 3000 });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l1'));
    presenter.pushVerdict(VERDICT);
    advance(4000);
    assert.deepEqual(log, []);
    advance(1500);
    assert.equal(log[0], 'fallback:watchdog');
    advance(30000);
    assert.equal(log.at(-1), 'verdict');
  });
  test('a signal re-arms the watchdog, and silence after it also falls back', () => {
    const { presenter, log, advance } = harness({ audio: true, watchdogFirstMs: 5000, watchdogBetweenMs: 3000 });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l1'));
    presenter.pushLine(lineEv('l2'));
    advance(4000);
    presenter.audioStarted('l1');
    advance(2500);
    assert.ok(!log.some((x) => x.startsWith('fallback')));
    advance(1000);
    assert.ok(log.includes('fallback:watchdog'));
    advance(10000);
    assert.ok(log.includes('start:l2'));
  });
  test('the player finishing with signals missing releases the rest instead of hanging', () => {
    const { presenter, log, advance } = harness({ audio: true });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l1'));
    presenter.pushLine(lineEv('l2'));
    presenter.audioStarted('l1');
    presenter.audioEnded(true);
    assert.ok(log.includes('fallback:missing-signals'));
    advance(10000);
    assert.ok(log.includes('start:l2'));
  });
  test('abandonAudio (no script, no voice module) runs the debate on timers', () => {
    const { presenter, log } = harness({ audio: true });
    presenter.pushLine(lineEv('l1'));
    presenter.abandonAudio('no-script');
    assert.deepEqual(log.filter((x) => x.startsWith('start')), ['start:l1']);
  });
  test('reset (Start over) cancels the watchdog and pending items', () => {
    const { presenter, log, advance } = harness({ audio: true, watchdogFirstMs: 1000 });
    presenter.audioStarting();
    presenter.pushLine(lineEv('l1'));
    presenter.reset();
    advance(5000);
    assert.deepEqual(log, []);
  });
});
