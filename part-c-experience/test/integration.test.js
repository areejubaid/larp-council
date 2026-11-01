import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { WebSocket } from 'ws';
import { createApp, buildCsp, normalizeOrigin, triggerBrain } from '../server/index.js';
import { buildScript } from '../server/script.js';
import { validateDebateScript } from '../server/validate.js';
import { loadScenario, mockName, ReplayManager, MIND_IDS } from '../server/replay.js';
import { Hub } from '../server/hub.js';

const MOCKS = new URL('../mocks/', import.meta.url);
const mockFiles = readdirSync(MOCKS).filter((f) => f.endsWith('.json'));
const readMock = (f) => JSON.parse(readFileSync(new URL(f, MOCKS), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('mocks', () => {
  test('one LARP mock per mind, each with character_scored and no lines from the player', () => {
    for (const m of MIND_IDS) {
      const events = readMock(`larp-${m}.json`);
      assert.ok(events.some((e) => e.type === 'character_scored'), m);
      const pitch = events.find((e) => e.type === 'pitch_received').payload;
      assert.equal(pitch.mode, 'larp');
      assert.equal(pitch.chosenMindId, m);
      assert.ok(!events.some((e) => e.type === 'line_ready' && e.payload.mindId === m), `${m} must not speak`);
    }
    assert.ok(!mockFiles.includes('larp.json'), 'the old swapped mock is gone');
  });
  test('mockName picks by mind and defaults to the perfectionist', () => {
    assert.equal(mockName('larp', 'engineer'), 'larp-engineer');
    assert.equal(mockName('larp', 'nobody'), 'larp-perfectionist');
    assert.equal(mockName('larp'), 'larp-perfectionist');
    assert.equal(mockName('bad', 'engineer'), 'bad');
    assert.throws(() => mockName('weird'));
  });
});

describe('buildScript', () => {
  test('builds a valid DebateScript from every mock', () => {
    for (const f of mockFiles) {
      const events = readMock(f);
      const script = buildScript(events, 'abc');
      assert.ok(validateDebateScript(script).ok, f);
      assert.equal(script.sessionId, 'abc');
      assert.equal(script.lines.length, events.filter((e) => e.type === 'line_ready').length);
      assert.equal(script.verdict.embarrassmentScore, events.find((e) => e.type === 'verdict_ready').payload.embarrassmentScore);
    }
  });
  test('LARP scripts carry the character score, roast scripts carry null', () => {
    assert.equal(typeof buildScript(readMock('larp-engineer.json')).characterScore, 'number');
    assert.equal(buildScript(readMock('bad.json')).characterScore, null);
    assert.equal(buildScript(readMock('larp-engineer.json')).mode, 'larp');
  });
  test('does not mutate the events and rejects incomplete streams', () => {
    const events = readMock('bad.json');
    const before = JSON.stringify(events);
    buildScript(events);
    assert.equal(JSON.stringify(events), before);
    assert.throws(() => buildScript(events.filter((e) => e.type !== 'verdict_ready')));
    assert.throws(() => buildScript(events.filter((e) => e.type !== 'line_ready')));
  });
});

describe('CSP and voice config', () => {
  test('voice origin is added to script, connect and media only when set', () => {
    const off = buildCsp('');
    assert.ok(!off.includes('media-src'));
    assert.ok(!/localhost|http:\/\//.test(off));
    const on = buildCsp('http://localhost:8787');
    for (const d of ['script-src', 'connect-src', 'media-src']) {
      assert.match(on, new RegExp(`${d}[^;]*http://localhost:8787`), d);
    }
    assert.doesNotMatch(on, /style-src[^;]*8787/);
    assert.doesNotMatch(on, /img-src[^;]*8787/);
  });
  test('normalizeOrigin keeps only an http(s) origin', () => {
    assert.equal(normalizeOrigin('https://v.onrender.com/'), 'https://v.onrender.com');
    assert.equal(normalizeOrigin('http://localhost:8787/player.js'), 'http://localhost:8787');
    assert.equal(normalizeOrigin('javascript:alert(1)'), '');
    assert.equal(normalizeOrigin('nonsense'), '');
    assert.equal(normalizeOrigin(''), '');
  });
  test('/api/config reports voiceUrl and the CSP header follows it', async () => {
    for (const voiceUrl of ['', 'http://127.0.0.1:8787/']) {
      const app = createApp({ port: 0, host: '127.0.0.1', voiceUrl });
      const port = await app.listen();
      try {
        const cfg = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
        assert.equal(cfg.voiceUrl, voiceUrl ? 'http://127.0.0.1:8787' : '');
        const page = await fetch(`http://127.0.0.1:${port}/`);
        const csp = page.headers.get('content-security-policy');
        assert.equal(csp.includes('http://127.0.0.1:8787'), Boolean(voiceUrl));
        assert.equal(csp.includes('media-src'), Boolean(voiceUrl));
      } finally {
        await app.close();
      }
    }
  });
});

describe('Brain integration', () => {
  /** Fake Brain with a configurable behaviour. Records request bodies. */
  async function fakeBrain(handler) {
    const seen = [];
    const server = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => { b += c; });
      req.on('end', () => { seen.push({ url: req.url, body: JSON.parse(b || '{}') }); handler(req, res, seen.at(-1).body); });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { seen, url: `http://127.0.0.1:${server.address().port}/run`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
  }
  const okBrain = (req, res, body) => {
    const events = readMock('bad.json').map((e) => ({ ...e, sessionId: body.sessionId }));
    const script = buildScript(events, body.sessionId);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ script, events }));
  };

  async function withHub(brainUrl, fn, extra = {}) {
    const app = createApp({ port: 0, host: '127.0.0.1', brainUrl, replaySpeed: 1000, brainTimeoutMs: 1000, ...extra });
    const port = await app.listen();
    const call = (p, body) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try { await fn({ app, port, call }); } finally { await app.close(); }
  }
  const pitch = (sessionId, extra = {}) => ({ sessionId, mode: 'roast', pitchText: 'an app for pigeons', ...extra });

  test('success: events come from the /run reply, replayed through the hub, script returned', async () => {
    const brain = await fakeBrain(okBrain);
    try {
      await withHub(brain.url, async ({ app, call }) => {
        const r = await call('/api/pitch', pitch('b1', { voice: false }));
        const j = await r.json();
        assert.equal(r.status, 200);
        assert.equal(j.source, 'brain');
        assert.ok(validateDebateScript(j.script).ok);
        await app.replay.active.get('b1')?.done;
        const got = app.hub.history('b1');
        assert.equal(got.length, readMock('bad.json').length);
        assert.deepEqual(got.map((g) => g.event.type), readMock('bad.json').map((e) => e.type));
        // The Brain got contract fields only, no `voice`.
        assert.deepEqual(Object.keys(brain.seen[0].body).sort(), ['mode', 'pitchText', 'sessionId']);
        assert.equal(brain.seen[0].url, '/run');
      });
    } finally { await brain.close(); }
  });

  test('a Brain 400 is returned as 400 and never falls back to demo', async () => {
    const brain = await fakeBrain((req, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"chosenMindId required in larp mode"}'); });
    try {
      await withHub(brain.url, async ({ app, call }) => {
        const r = await call('/api/pitch', pitch('b400'));
        assert.equal(r.status, 400);
        assert.equal((await r.json()).error, 'chosenMindId required in larp mode');
        assert.equal(app.replay.active.size, 0);
        assert.equal(app.hub.history('b400').length, 0);
      });
    } finally { await brain.close(); }
  });

  test('5xx, network error, timeout and junk replies fall back to a labelled demo with a script', async () => {
    const modes = {
      '500': (req, res) => { res.writeHead(500); res.end('{"error":"internal error"}'); },
      timeout: () => { /* never answers */ },
      junk: (req, res) => { res.writeHead(200); res.end('<html>nope</html>'); },
      noevents: (req, res) => { res.writeHead(200); res.end('{"script":{},"events":[]}'); },
    };
    for (const [name, handler] of Object.entries(modes)) {
      const brain = await fakeBrain(handler);
      try {
        await withHub(brain.url, async ({ call }) => {
          const j = await (await call('/api/pitch', pitch(`fb-${name}`))).json();
          assert.equal(j.source, 'demo', name);
          assert.ok(j.reason, name);
          assert.ok(validateDebateScript(j.script).ok, name);
        }, { brainTimeoutMs: 300 });
      } finally { await brain.close(); }
    }
    await withHub('http://127.0.0.1:1/run', async ({ call }) => {
      const j = await (await call('/api/pitch', pitch('fb-down'))).json();
      assert.equal(j.source, 'demo');
      assert.match(j.reason, /unreachable/);
    });
  });

  test('BRAIN_TIMEOUT_MS defaults to 75000', () => {
    const saved = process.env.BRAIN_TIMEOUT_MS;
    delete process.env.BRAIN_TIMEOUT_MS;
    try { assert.equal(createApp({ port: 0 }).config.brainTimeoutMs, 75000); } finally { if (saved) process.env.BRAIN_TIMEOUT_MS = saved; }
    process.env.BRAIN_TIMEOUT_MS = '1234';
    try { assert.equal(createApp({ port: 0 }).config.brainTimeoutMs, 1234); } finally { delete process.env.BRAIN_TIMEOUT_MS; }
  });

  test('triggerBrain without a URL reports why', async () => {
    assert.deepEqual(await triggerBrain({}, { brainUrl: '' }), { ok: false, reason: 'BRAIN_URL not set' });
  });

  test('voice:true publishes everything at once, with no pacing', async () => {
    const brain = await fakeBrain(okBrain);
    try {
      const app = createApp({ port: 0, host: '127.0.0.1', brainUrl: brain.url, replaySpeed: 1 });
      const port = await app.listen();
      try {
        const post = (p, b) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
        const j = await (await post('/api/pitch', pitch('v1', { voice: true }))).json();
        assert.equal(j.source, 'brain');
        assert.equal(app.hub.history('v1').length, readMock('bad.json').length, 'all events already in the hub');
        const d = await (await post('/api/demo', { scenario: 'good', sessionId: 'v2', voice: true })).json();
        assert.equal(app.hub.history('v2').length, readMock('good.json').length);
        assert.ok(validateDebateScript(d.script).ok);
        // Without voice the same call is paced, so almost nothing has arrived yet.
        await post('/api/demo', { scenario: 'good', sessionId: 'v3' });
        assert.ok(app.hub.history('v3').length < 2);
      } finally { await app.close(); }
    } finally { await brain.close(); }
  });

  test('demo responses include a valid script, and LARP demos use the chosen mind mock', async () => {
    await withHub('', async ({ app, call }) => {
      for (const mind of MIND_IDS) {
        const j = await (await call('/api/demo', { scenario: 'larp', sessionId: `d-${mind}`, chosenMindId: mind, voice: true })).json();
        assert.ok(validateDebateScript(j.script).ok);
        assert.equal(j.script.mode, 'larp');
        assert.ok(!j.script.lines.some((l) => l.mindId === mind), `${mind} must not speak`);
        const ev = app.hub.history(`d-${mind}`).map((e) => e.event);
        assert.equal(ev.find((e) => e.type === 'pitch_received').payload.chosenMindId, mind);
        assert.ok(ev.every((e) => e.sessionId === `d-${mind}`));
      }
      const fb = await (await call('/api/pitch', { sessionId: 'fb-larp', mode: 'larp', chosenMindId: 'engineer', pitchText: 'x' })).json();
      assert.equal(fb.source, 'demo');
      assert.equal(fb.scenario, 'larp');
      assert.ok(!fb.script.lines.some((l) => l.mindId === 'engineer'));
    });
  });

  test('ReplayManager.startEvents rewrites sessionId and ts and leaves the input alone', () => {
    const hub = new Hub();
    const rm = new ReplayManager(hub, { speed: 1000 });
    const src = loadScenario('good');
    const copy = JSON.stringify(src);
    rm.startEvents(src, 'zzz', { voice: true });
    assert.equal(JSON.stringify(src), copy);
    const got = hub.history('zzz');
    assert.equal(got.length, src.length);
    assert.ok(got.every((g) => g.event.sessionId === 'zzz'));
  });

  test('WebSocket clients still see the events of a brain session', async () => {
    const brain = await fakeBrain(okBrain);
    try {
      await withHub(brain.url, async ({ port, call }) => {
        const got = [];
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=ws1`);
        ws.on('message', (m) => got.push(JSON.parse(m)));
        await new Promise((r) => ws.on('open', r));
        await call('/api/pitch', pitch('ws1', { voice: true }));
        await sleep(200);
        ws.close();
        assert.equal(got.length, readMock('bad.json').length);
      });
    } finally { await brain.close(); }
  });
});
