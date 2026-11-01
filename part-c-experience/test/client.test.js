// Unit tests for the DOM-free client modules (text helpers and the presentation queue).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plain, lineDuration } from '../public/js/text.js';
import { createPresenter } from '../public/js/presenter.js';
import { BEAT_PRINCIPLES, MOOD_METER } from '../public/js/constants.js';

describe('text helpers', () => {
  test('plain strips bracketed tags and never mutates the original event', () => {
    const event = { payload: { text: '[long pause] [deadpan] This is a junk drawer.' } };
    const frozen = JSON.stringify(event);
    assert.equal(plain(event.payload.text), 'This is a junk drawer.');
    assert.equal(JSON.stringify(event), frozen);
  });
  test('line duration has a floor and a cap', () => {
    assert.equal(lineDuration('hi'), 2400);
    assert.equal(lineDuration('x'.repeat(1000)), 6200);
  });
  test('constants match the brief', () => {
    assert.deepEqual(MOOD_METER, { slow_clap: 5, impressed: 20, skeptical: 45, sarcastic: 70, appalled: 95 });
    assert.deepEqual([...BEAT_PRINCIPLES], ['rage_quit', 'slow_clap']);
  });
});

/** Presenter with a manual clock. */
function harness() {
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
  }, { setTimer, clearTimer });
  return { presenter, log, advance };
}
const line = (lineId, extra = {}) => ({ type: 'line_ready', payload: { lineId, mindId: 'engineer', text: 'x'.repeat(60), principleId: 'p', ...extra } });

describe('presenter', () => {
  test('a burst of lines is shown one at a time, in order, and the verdict waits', () => {
    const { presenter, log, advance } = harness();
    presenter.pushLine(line('l1'));
    presenter.pushLine(line('l2'));
    presenter.pushVerdict({ type: 'verdict_ready', payload: {} });
    assert.deepEqual(log, ['start:l1']);
    advance(6000);
    assert.deepEqual(log.slice(0, 3), ['start:l1', 'end:l1', 'start:l2']);
    assert.ok(!log.includes('verdict'));
    advance(10000);
    assert.equal(log.at(-1), 'verdict');
  });
  test('an interrupting line cuts the current one off immediately', () => {
    const { presenter, log } = harness();
    presenter.pushLine(line('l1'));
    presenter.pushLine(line('l2', { interruptsLineId: 'l1' }));
    assert.deepEqual(log, ['start:l1', 'end:l1:cut', 'start:l2']);
  });
  test('slow clap line goes silent first, then lands once; the slow_clap event does not repeat it', () => {
    const { presenter, log, advance } = harness();
    presenter.pushLine(line('l9', { principleId: 'slow_clap' }));
    presenter.pushBeat({ type: 'slow_clap', payload: { lineId: 'l9' } });
    assert.deepEqual(log, ['silence:true']);
    advance(3000);
    assert.deepEqual(log, ['silence:true', 'silence:false', 'start:l9']);
    advance(10000);
    assert.equal(log.filter((x) => x === 'beat:slow_clap').length, 0);
  });
  test('rage quit beat lands after its line has finished', () => {
    const { presenter, log, advance } = harness();
    presenter.pushLine(line('l6', { principleId: 'rage_quit' }));
    presenter.pushBeat({ type: 'rage_quit', payload: { lineId: 'l6', mindId: 'engineer' } });
    assert.deepEqual(log, ['start:l6']);
    advance(5000);
    assert.deepEqual(log, ['start:l6', 'end:l6', 'beat:rage_quit']);
  });
  test('reset drops everything pending', () => {
    const { presenter, log, advance } = harness();
    presenter.pushLine(line('l1'));
    presenter.pushLine(line('l2'));
    presenter.reset();
    advance(20000);
    assert.deepEqual(log, ['start:l1']);
  });
});
