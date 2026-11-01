import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { Hub } from '../server/hub.js';
import { createApp, MAX_BODY_BYTES } from '../server/index.js';
import { validateEvent, validatePitchInput, EVENT_TYPES } from '../server/validate.js';
import { loadScenario, schedule, SCENARIOS, stripTags } from '../server/replay.js';

const ev = (sessionId, type = 'pitch_received', payload = {}) => ({ version: 1, sessionId, ts: 1760000000, type, payload });

describe('validate', () => {
  test('accepts every contract event type', () => {
    assert.equal(EVENT_TYPES.length, 11);
    for (const t of EVENT_TYPES) assert.ok(validateEvent(ev('s1', t)).ok, t);
  });
  test('rejects bad shapes', () => {
    const bad = [
      { ...ev('s1'), version: 2 }, { ...ev('s1'), type: 'nope' }, { ...ev(''), sessionId: '' },
      { ...ev('s1'), sessionId: 5 }, { ...ev('s1'), payload: [] }, { ...ev('s1'), payload: null },
      { ...ev('s1'), ts: '1' }, { ...ev('s1'), ts: NaN }, null, 'x', [],
    ];
    for (const b of bad) assert.equal(validateEvent(b).ok, false, JSON.stringify(b));
  });
  test('pitch input mirrors validate_pitch_input', () => {
    assert.ok(validatePitchInput({ sessionId: 's', mode: 'roast', pitchText: 'hi' }).ok);
    assert.ok(validatePitchInput({ sessionId: 's', mode: 'larp', pitchText: 'hi', chosenMindId: 'engineer' }).ok);
    assert.equal(validatePitchInput({ sessionId: 's', mode: 'larp', pitchText: 'hi' }).ok, false);
    assert.equal(validatePitchInput({ sessionId: 's', mode: 'x', pitchText: 'hi' }).ok, false);
    assert.equal(validatePitchInput({ sessionId: 's', mode: 'roast', pitchText: '   ' }).ok, false);
    assert.equal(validatePitchInput({ sessionId: '', mode: 'roast', pitchText: 'hi' }).ok, false);
  });
});

describe('Hub', () => {
  test('assigns per-session sequence numbers and keeps sessions isolated', () => {
    const hub = new Hub();
    const a = [];
    const b = [];
    hub.subscribe('A', (e) => a.push(e));
    hub.subscribe('B', (e) => b.push(e));
    hub.publish('A', ev('A'));
    hub.publish('A', ev('A'));
    hub.publish('B', ev('B'));
    assert.deepEqual(a.map((e) => e.seq), [1, 2]);
    assert.deepEqual(b.map((e) => e.seq), [1]);
  });
  test('caps events per session, keeping the newest, with seq still increasing', () => {
    const hub = new Hub({ maxEventsPerSession: 3 });
    for (let i = 0; i < 5; i++) hub.publish('A', ev('A'));
    assert.deepEqual(hub.history('A').map((e) => e.seq), [3, 4, 5]);
  });
  test('evicts the oldest session at the cap, preferring unwatched ones', () => {
    const hub = new Hub({ maxSessions: 2 });
    hub.publish('s1', ev('s1'));
    hub.subscribe('s1', () => {});
    hub.publish('s2', ev('s2'));
    hub.publish('s3', ev('s3'));
    assert.ok(hub.history('s1').length);
    assert.equal(hub.history('s2').length, 0);
    assert.ok(hub.history('s3').length);
  });
  test('unsubscribe stops delivery; a throwing subscriber does not block others', () => {
    const hub = new Hub();
    const got = [];
    hub.subscribe('A', () => { throw new Error('boom'); });
    const off = hub.subscribe('A', (e) => got.push(e));
    hub.publish('A', ev('A'));
    off();
    hub.publish('A', ev('A'));
    assert.equal(got.length, 1);
  });
});

describe('replay schedule', () => {
  test('is monotonic, and the bad scenario lasts about 30 to 35 seconds', () => {
    for (const s of SCENARIOS) {
      const o = schedule(loadScenario(s));
      for (let i = 1; i < o.length; i++) assert.ok(o[i] >= o[i - 1], `${s} offsets not monotonic at ${i}`);
    }
    const bad = schedule(loadScenario('bad')).at(-1) / 1000;
    assert.ok(bad >= 30 && bad <= 35, `bad replay took ${bad}s`);
  });
  test('interrupting line starts well before the previous one would end', () => {
    const events = loadScenario('bad');
    const o = schedule(events);
    const i1 = events.findIndex((e) => e.type === 'line_ready');
    const i2 = events.findIndex((e, i) => i > i1 && e.type === 'line_ready');
    assert.ok(o[i2] - o[i1] <= 1200);
  });
  test('stripTags removes bracketed tags without touching other text', () => {
    assert.equal(stripTags('[deadpan] Hello [pause] world'), 'Hello world');
  });
});

describe('server', () => {
  let app;
  let base;
  let port;
  before(async () => {
    app = createApp({ port: 0, host: '127.0.0.1', brainUrl: '', replaySpeed: 1000 });
    port = await app.listen();
    base = `http://127.0.0.1:${port}`;
  });
  after(() => app.close());

  const post = (p, body, raw) => fetch(base + p, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body),
  });

  /** Collect envelopes from a WS until `count` arrive or timeout. */
  function collect(sessionId, count, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${encodeURIComponent(sessionId)}`);
      const got = [];
      const t = setTimeout(() => { ws.close(); resolve(got); }, timeoutMs);
      ws.on('message', (m) => {
        got.push(JSON.parse(m));
        if (got.length >= count) { clearTimeout(t); ws.close(); resolve(got); }
      });
      ws.on('error', reject);
    });
  }
  const openWs = (sessionId) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${sessionId}`);
    const got = [];
    ws.on('message', (m) => got.push(JSON.parse(m)));
    ws.on('open', () => resolve({ ws, got }));
    ws.on('error', reject);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  test('healthz', async () => {
    const r = await fetch(base + '/healthz');
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'ok');
  });

  test('POST /events accepts a valid event', async () => {
    const r = await post('/events', ev('valid1', 'mood_changed', { mindId: 'engineer', mood: 'sarcastic' }));
    assert.equal(r.status, 200);
  });

  test('POST /events rejects invalid events with 400', async () => {
    for (const bad of [{ ...ev('x'), version: 2 }, { ...ev('x'), type: 'bogus' }, { ...ev('x'), sessionId: '' },
      { ...ev('x'), payload: 'no' }, { ...ev('x'), ts: 'now' }, []]) {
      assert.equal((await post('/events', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await post('/events', null, '{not json')).status, 400);
  });

  test('POST /events returns 413 above 256 KB', async () => {
    const big = ev('big', 'pitch_received', { blob: 'x'.repeat(MAX_BODY_BYTES + 10) });
    const r = await post('/events', big);
    assert.equal(r.status, 413);
  });

  test('session isolation and history on connect over WS', async () => {
    await post('/events', ev('iso-A', 'pitch_received', { n: 1 }));
    await post('/events', ev('iso-A', 'idea_scored', { n: 2 }));
    await post('/events', ev('iso-B', 'pitch_received', { n: 99 }));
    const { ws, got } = await openWs('iso-A');
    await post('/events', ev('iso-A', 'mood_changed', { n: 3 }));
    await post('/events', ev('iso-B', 'mood_changed', { n: 98 }));
    await sleep(150);
    ws.close();
    assert.deepEqual(got.map((e) => e.event.payload.n), [1, 2, 3], 'history first, then live, no leaks');
    assert.deepEqual(got.map((e) => e.seq), [1, 2, 3]);
  });

  test('WS without sessionId is refused', async () => {
    await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on('error', () => resolve());
      ws.on('open', () => { ws.close(); assert.fail('should not open'); });
    });
  });

  test('/api/pitch validates input', async () => {
    assert.equal((await post('/api/pitch', { sessionId: 'p', mode: 'larp', pitchText: 'x' })).status, 400);
    assert.equal((await post('/api/pitch', { sessionId: 'p', mode: 'roast', pitchText: '' })).status, 400);
  });

  test('/api/pitch falls back to demo replay when BRAIN_URL is unset', async () => {
    const r = await post('/api/pitch', { sessionId: 'pitch-unset', mode: 'roast', pitchText: 'an app' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.source, 'demo');
    assert.equal(j.sessionId, 'pitch-unset');
    assert.match(j.reason, /BRAIN_URL/);
    const got = await collect('pitch-unset', 15);
    assert.equal(got.length, 15);
  });

  test('/api/pitch falls back to demo when BRAIN_URL is unreachable', async () => {
    const a2 = createApp({ port: 0, host: '127.0.0.1', brainUrl: 'http://127.0.0.1:1/run', brainTimeoutMs: 800, replaySpeed: 1000 });
    const p2 = await a2.listen();
    try {
      const r = await fetch(`http://127.0.0.1:${p2}/api/pitch`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'pitch-down', mode: 'larp', chosenMindId: 'operator', pitchText: 'an app' }),
      });
      const j = await r.json();
      assert.equal(r.status, 200);
      assert.equal(j.source, 'demo');
      assert.equal(j.scenario, 'larp');
      assert.match(j.reason, /unreachable/);
    } finally {
      await a2.close();
    }
  });

  test('/api/demo validates scenario and sessionId', async () => {
    assert.equal((await post('/api/demo', { scenario: 'nope', sessionId: 'd' })).status, 400);
    assert.equal((await post('/api/demo', { scenario: 'bad', sessionId: '' })).status, 400);
    assert.equal((await post('/api/demo', { scenario: 'bad' })).status, 400);
  });

  test('replay emits every event in order with the sessionId rewritten', async () => {
    for (const scenario of SCENARIOS) {
      const sessionId = `replay-${scenario}`;
      const source = loadScenario(scenario, 'perfectionist');
      const r = await post('/api/demo', { scenario, sessionId, chosenMindId: 'perfectionist' });
      assert.equal(r.status, 200);
      const got = await collect(sessionId, source.length);
      assert.equal(got.length, source.length, scenario);
      assert.deepEqual(got.map((g) => g.event.type), source.map((s) => s.type));
      assert.deepEqual(got.map((g) => g.seq), source.map((_, i) => i + 1));
      assert.ok(got.every((g) => g.event.sessionId === sessionId));
      assert.ok(got.every((g) => typeof g.event.ts === 'number'));
      assert.deepEqual(got.map((g) => g.event.payload), source.map((s) => s.payload));
    }
  });

  test('a new replay cancels the running one for the same session', async () => {
    const slow = createApp({ port: 0, host: '127.0.0.1', replaySpeed: 1 });
    try {
      const h1 = slow.replay.start('bad', 'cancel-me');
      await sleep(700);
      const before = slow.hub.history('cancel-me').length;
      assert.ok(before >= 1 && before < 15);
      const h2 = slow.replay.start('good', 'cancel-me');
      await h1.done;
      assert.equal(slow.replay.active.get('cancel-me'), h2);
      await sleep(800);
      const types = slow.hub.history('cancel-me').map((e) => e.event.type);
      assert.ok(types.filter((t) => t === 'pitch_received').length === 2, 'second replay restarted');
      assert.ok(!types.includes('verdict_ready'), 'cancelled replay never finished');
    } finally {
      await slow.close();
    }
  });

  /** Raw request so the client does not normalise the path. */
  const raw = (p) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET' }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.end();
  });

  test('static files are served and path traversal is rejected', async () => {
    const ok = await raw('/');
    assert.equal(ok.status, 200);
    assert.match(ok.body, /<!doctype html>/i);
    for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/js/..%2f..%2f..%2fpackage.json',
      '/..%5c..%5cpackage.json', '/%00', '/../package.json', '/../../../../../../windows/win.ini']) {
      const r = await raw(p);
      assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`);
      assert.ok(!r.body.includes('mind-council-experience'), `${p} leaked package.json`);
    }
    const missing = await raw('/nope.html');
    assert.equal(missing.status, 404);
  });
});
