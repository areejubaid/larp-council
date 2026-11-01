import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, deriveBrainBase, proxyBrain } from '../server/index.js';
import { createFakeBrain, PERSONAS } from './fake-brain.js';
import { stripAudioTags, readingMs, initials, textOn, contrast, truncate, formatClock, buildTurnScript } from '../public/js/call/util.js';
import { validateDebateScript } from '../server/validate.js';

describe('deriveBrainBase', () => {
  test('strips a trailing /run and slashes; BRAIN_BASE wins', () => {
    assert.equal(deriveBrainBase('', 'http://localhost:8001/run'), 'http://localhost:8001');
    assert.equal(deriveBrainBase('', 'http://localhost:8001/run/'), 'http://localhost:8001');
    assert.equal(deriveBrainBase('', 'https://b.example.com/api/'), 'https://b.example.com/api');
    assert.equal(deriveBrainBase('http://other:9/', 'http://localhost:8001/run'), 'http://other:9');
    assert.equal(deriveBrainBase('', ''), '');
  });
});

describe('hub proxy routes', () => {
  let fake, hub, base, fakePort;
  before(async () => {
    fake = createFakeBrain({ delayMs: 5 });
    fakePort = await fake.listen(0);
    hub = createApp({ port: 0, host: '127.0.0.1', brainUrl: `http://127.0.0.1:${fakePort}/run`, heartbeatMs: 60000 });
    const port = await hub.listen();
    base = `http://127.0.0.1:${port}`;
  });
  after(async () => { await hub.close(); await fake.close(); });

  const post = (path, body, raw) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) });

  test('GET /api/personas forwards the Brain list', async () => {
    const res = await fetch(base + '/api/personas');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), PERSONAS);
  });
  test('POST /api/turn forwards the body and returns the Brain reply', async () => {
    const body = { sessionId: 's1', idea: 'Google Maps for jobs', personas: ['jobs', 'musk'], history: [], endCall: false };
    const res = await post('/api/turn', body);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.turns[0].speaker, 'jobs');
    assert.equal(data.awaitingUser, true);
    assert.deepEqual(fake.calls.at(-1), body);
  });
  test('endCall returns done with a summary', async () => {
    const res = await post('/api/turn', { sessionId: 's2', idea: 'x', personas: ['jobs'], history: [{ speaker: 'user', text: 'hi' }], endCall: true });
    const data = await res.json();
    assert.equal(data.done, true);
    assert.equal(data.summary.perPersona.length, 4);
  });
  test('a Brain 400 is passed through', async () => {
    const res = await post('/api/turn', { sessionId: 's3', history: [] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'idea is required');
  });
  test('bad JSON is 400, non object is 400, wrong method is 405', async () => {
    assert.equal((await post('/api/turn', null, '{nope')).status, 400);
    assert.equal((await post('/api/turn', null, '[1]')).status, 400);
    assert.equal((await fetch(base + '/api/turn')).status, 405);
    assert.equal((await post('/api/personas', {})).status, 405);
  });
  test('an oversized body is 413', async () => {
    const res = await post('/api/turn', { idea: 'x'.repeat(70 * 1024) });
    assert.equal(res.status, 413);
  });
  test('the page at / is the call UI', async () => {
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /<title>LARP Council<\/title>/);
    assert.doesNotMatch(html, /Mind Council/);
  });
});

describe('hub proxy when the Brain is down or slow', () => {
  test('unreachable Brain gives a clear 502 JSON error', async () => {
    const hub = createApp({ port: 0, host: '127.0.0.1', brainUrl: 'http://127.0.0.1:1/run', heartbeatMs: 60000 });
    const base = `http://127.0.0.1:${await hub.listen()}`;
    try {
      for (const [path, init] of [['/api/personas', {}], ['/api/turn', { method: 'POST', body: '{"idea":"x"}' }]]) {
        const res = await fetch(base + path, init);
        assert.equal(res.status, 502, path);
        const data = await res.json();
        assert.equal(data.error, 'brain_unavailable');
        assert.ok(data.message.length > 10);
      }
    } finally { await hub.close(); }
  });
  test('no Brain configured is a 502, not a crash', async () => {
    const hub = createApp({ port: 0, host: '127.0.0.1', brainUrl: '', brainBase: '', heartbeatMs: 60000 });
    const base = `http://127.0.0.1:${await hub.listen()}`;
    try {
      const res = await fetch(base + '/api/personas');
      assert.equal(res.status, 502);
      assert.match((await res.json()).message, /not configured/);
    } finally { await hub.close(); }
  });
  test('a slow Brain times out as 502; a Brain 5xx and non JSON are 502', async () => {
    const slow = await proxyBrain('/turn', { brainBase: 'http://x', method: 'POST', body: {}, timeoutMs: 20,
      fetchImpl: (url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('t'), { name: 'TimeoutError' })))) });
    assert.equal(slow.status, 502);
    assert.match(slow.body.message, /too long/);
    const five = await proxyBrain('/turn', { brainBase: 'http://x', fetchImpl: async () => new Response('{"a":1}', { status: 500 }) });
    assert.equal(five.status, 502);
    const junk = await proxyBrain('/turn', { brainBase: 'http://x', fetchImpl: async () => new Response('<html>', { status: 200 }) });
    assert.equal(junk.status, 502);
    assert.equal(junk.body.error, 'brain_bad_reply');
  });
});

describe('call UI helpers', () => {
  test('stripAudioTags removes tags and tidies spaces', () => {
    assert.equal(stripAudioTags('[laughs] Fair point. [sighs] But why?'), 'Fair point. But why?');
    assert.equal(stripAudioTags('Hello [leans in] , world'), 'Hello, world');
    assert.equal(stripAudioTags(null), '');
  });
  test('readingMs scales with length and is clamped', () => {
    assert.equal(readingMs('hi'), 1800);
    assert.ok(readingMs('word '.repeat(40)) > 5000);
    assert.equal(readingMs('x'.repeat(5000)), 9000);
  });
  test('initials, truncate, clock', () => {
    assert.equal(initials('Steve Jobs'), 'SJ');
    assert.equal(initials('Warren Edward Buffett'), 'WB');
    assert.equal(initials('Cher'), 'CH');
    assert.equal(initials(''), '?');
    assert.equal(truncate('a'.repeat(70), 10).length, 10);
    assert.equal(formatClock(125), '02:05');
  });
  test('avatar text colour always reaches AA (4.5) on the persona colours', () => {
    for (const p of PERSONAS) assert.ok(contrast(p.color, textOn(p.color)) >= 4.5, p.id);
  });
  test('buildTurnScript is a valid one line DebateScript', () => {
    const s = buildTurnScript({ speaker: 'musk', text: 'Hi' }, 'sess', 3);
    // Same shape Part A's playDebate reads; verdict is null on purpose so no verdict event fires per turn.
    const withVerdict = { ...s, verdict: { embarrassmentScore: 0, summary: 's', roast: 'r' } };
    assert.ok(validateDebateScript(withVerdict).ok, JSON.stringify(validateDebateScript(withVerdict)));
    assert.equal(s.verdict, null);
    assert.equal(s.lines.length, 1);
    assert.equal(s.lines[0].mindId, 'musk');
  });
});
