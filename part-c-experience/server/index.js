// Mind Council Event Hub: contract events in over HTTP, sessions out over WebSocket, static UI, demo replay.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { Hub } from './hub.js';
import { ReplayManager, SCENARIOS } from './replay.js';
import { validateEvent, validatePitchInput, MAX_SESSION_ID_LEN } from './validate.js';
import { buildScript } from './script.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, '..', 'public');
export const MAX_BODY_BYTES = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

/** Content Security Policy. The voice origin is allowed for scripts, fetches and media only when configured. */
export function buildCsp(voiceUrl) {
  const v = voiceUrl ? ` ${voiceUrl}` : '';
  const parts = [
    "default-src 'self'",
    `connect-src 'self' ws: wss:${v}`,
    "img-src 'self' data:",
    "style-src 'self'",
    `script-src 'self'${v}`,
  ];
  if (voiceUrl) parts.push(`media-src 'self'${v}`);
  parts.push("base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'");
  return parts.join('; ');
}

/** Reduce VOICE_URL to a bare origin (no path, no trailing slash). Returns '' if it is not http(s). */
export function normalizeOrigin(value) {
  if (!value) return '';
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : '';
  } catch {
    return '';
  }
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
  });
  res.end(data);
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Read and parse a JSON body, enforcing the byte limit. */
function readJson(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      return reject(new HttpError(413, 'body too large'));
    }
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > limit) {
        tooBig = true;
        chunks.length = 0;
        reject(new HttpError(413, 'body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'body must be valid JSON'));
      }
    });
    req.on('error', () => reject(new HttpError(400, 'request error')));
  });
}

/**
 * Ask the Brain to run a pitch. The Brain (part-b-brain/server.py) answers POST /run synchronously
 * with {script, events}. BRAIN_URL is the full URL ending in /run.
 *   ok: true,  script, events     use them
 *   ok: false, userError          Brain said 400: the input is bad, do not fall back to demo
 *   ok: false, reason             unreachable, timeout, 5xx, bad reply: fall back to the labelled demo
 */
export async function triggerBrain(pitchInput, { brainUrl, timeoutMs = 75000, fetchImpl = fetch } = {}) {
  if (!brainUrl) return { ok: false, reason: 'BRAIN_URL not set' };
  let res;
  try {
    res = await fetchImpl(brainUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(pitchInput),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, reason: `Brain unreachable (${err?.name === 'TimeoutError' ? 'timeout' : 'network error'})` };
  }
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, userError: typeof body.error === 'string' ? body.error : 'The Brain rejected this pitch' };
  }
  if (!res.ok) return { ok: false, reason: `Brain answered HTTP ${res.status}` };
  try {
    const body = await res.json();
    if (!Array.isArray(body.events) || body.events.length === 0) throw new Error('no events');
    for (const e of body.events) if (!validateEvent(e).ok) throw new Error('bad event');
    return { ok: true, script: body.script ?? null, events: body.events };
  } catch {
    return { ok: false, reason: 'Brain sent an unusable reply' };
  }
}

async function serveStatic(req, res, publicDir, csp) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return sendJson(res, 400, { error: 'bad path' });
  }
  if (rel.includes('\0') || rel.includes('\\')) return sendJson(res, 400, { error: 'bad path' });
  if (rel.endsWith('/')) rel += 'index.html';
  // Resolve against the public root and make sure the result stays inside it.
  const root = path.resolve(publicDir);
  const target = path.resolve(root, '.' + path.posix.sep + rel);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }
  // Raw ".." segments in the request are rejected even when they would normalise to something safe.
  if (rel.split('/').includes('..')) return sendJson(res, 403, { error: 'forbidden' });
  try {
    const st = await stat(target);
    if (!st.isFile()) throw new Error('not a file');
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'content-security-policy': csp,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

export function createApp(opts = {}) {
  const env = process.env;
  const config = {
    port: opts.port ?? Number(env.PORT ?? 3000),
    host: opts.host ?? '0.0.0.0',
    brainUrl: opts.brainUrl !== undefined ? opts.brainUrl : (env.BRAIN_URL || ''),
    brainTimeoutMs: opts.brainTimeoutMs ?? (Number(env.BRAIN_TIMEOUT_MS) > 0 ? Number(env.BRAIN_TIMEOUT_MS) : 75000),
    voiceUrl: normalizeOrigin(opts.voiceUrl !== undefined ? opts.voiceUrl : env.VOICE_URL),
    replaySpeed: opts.replaySpeed ?? (Number(env.REPLAY_SPEED) > 0 ? Number(env.REPLAY_SPEED) : 1),
    publicDir: opts.publicDir ?? PUBLIC_DIR,
    mocksDir: opts.mocksDir,
    heartbeatMs: opts.heartbeatMs ?? 30000,
  };
  const csp = buildCsp(config.voiceUrl);
  const hub = opts.hub ?? new Hub();
  const replay = new ReplayManager(hub, { speed: config.replaySpeed, mocksDir: config.mocksDir });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const method = req.method;

    if (p === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('ok');
    }
    if (p === '/api/config' && method === 'GET') {
      return sendJson(res, 200, { replaySpeed: config.replaySpeed, brainConfigured: Boolean(config.brainUrl), voiceUrl: config.voiceUrl });
    }
    if (p === '/events') {
      if (method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
      const body = await readJson(req);
      const v = validateEvent(body);
      if (!v.ok) return sendJson(res, 400, { error: v.error });
      const env_ = hub.publish(body.sessionId, body);
      return sendJson(res, 200, { ok: true, seq: env_.seq });
    }
    if (p === '/api/pitch') {
      if (method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
      const body = await readJson(req);
      const v = validatePitchInput(body);
      if (!v.ok) return sendJson(res, 400, { error: v.error });
      const voice = body.voice === true;
      const pitchInput = { sessionId: body.sessionId, mode: body.mode, pitchText: body.pitchText,
        ...(body.chosenMindId ? { chosenMindId: body.chosenMindId } : {}) }; // contract fields only, no `voice`
      const brain = await triggerBrain(pitchInput, { brainUrl: config.brainUrl, timeoutMs: config.brainTimeoutMs });
      if (brain.userError) return sendJson(res, 400, { error: brain.userError });
      if (brain.ok) {
        const h = replay.startEvents(brain.events, body.sessionId, { voice, scenario: 'brain' });
        let script = brain.script;
        try { script ??= buildScript(h.events, body.sessionId); } catch { script = null; }
        return sendJson(res, 200, { sessionId: body.sessionId, source: 'brain', script, durationMs: h.durationMs });
      }
      const scenario = body.mode === 'larp' ? 'larp' : 'bad';
      const h = replay.start(scenario, body.sessionId, { chosenMindId: body.chosenMindId, voice });
      return sendJson(res, 200, {
        sessionId: body.sessionId, source: 'demo', scenario, reason: brain.reason,
        note: 'Demo replay: this is canned, not a judgement of your pitch.',
        script: buildScript(h.events, body.sessionId), durationMs: h.durationMs,
      });
    }
    if (p === '/api/demo') {
      if (method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
      const body = await readJson(req);
      if (!body || typeof body !== 'object' || !SCENARIOS.includes(body.scenario)) {
        return sendJson(res, 400, { error: `scenario must be one of ${SCENARIOS.join(', ')}` });
      }
      if (typeof body.sessionId !== 'string' || !body.sessionId.trim() || body.sessionId.length > MAX_SESSION_ID_LEN) {
        return sendJson(res, 400, { error: 'sessionId must be a non-empty string' });
      }
      const h = replay.start(body.scenario, body.sessionId, { chosenMindId: body.chosenMindId, voice: body.voice === true });
      return sendJson(res, 200, {
        sessionId: body.sessionId, source: 'demo', scenario: body.scenario,
        script: buildScript(h.events, body.sessionId), durationMs: h.durationMs,
      });
    }
    if (method === 'GET' || method === 'HEAD') return serveStatic(req, res, config.publicDir, csp);
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) {
        res.shouldKeepAlive = false;
        sendJson(res, err.status, { error: err.message });
        // Discard the rest of an oversized upload so the client can read the 413, then drop the socket.
        if (err.status === 413) {
          req.resume();
          setTimeout(() => req.destroy(), 2000).unref();
        }
        return;
      }
      console.error('unhandled error', err);
      sendJson(res, 500, { error: 'internal error' });
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { return socket.destroy(); }
    const sessionId = url.searchParams.get('sessionId');
    if (url.pathname !== '/ws' || !sessionId || sessionId.length > MAX_SESSION_ID_LEN) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('error', () => {});
      const send = (envelope) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(envelope));
      };
      // History first, then live. Both happen in one tick, so nothing can slip between them.
      for (const envelope of hub.history(sessionId)) send(envelope);
      const unsubscribe = hub.subscribe(sessionId, send);
      ws.on('close', unsubscribe);
    });
  });

  let heartbeat = null;
  function listen() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        server.off('error', reject);
        heartbeat = setInterval(() => {
          for (const ws of wss.clients) {
            if (!ws.isAlive) { ws.terminate(); continue; }
            ws.isAlive = false;
            ws.ping();
          }
        }, config.heartbeatMs);
        heartbeat.unref();
        resolve(server.address().port);
      });
    });
  }

  function close() {
    replay.cancelAll();
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    server.closeAllConnections?.();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, hub, replay, config, listen, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  app.listen().then((port) => {
    console.log(`Mind Council hub listening on http://${app.config.host}:${port}`);
    console.log(`Brain: ${app.config.brainUrl || 'not configured, /api/pitch falls back to demo replay'}; voice: ${app.config.voiceUrl || 'off'}; replay speed x${app.config.replaySpeed}`);
  });
  const stop = () => app.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
