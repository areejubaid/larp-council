// Network layer: JSON POST helper and a reconnecting per-session WebSocket.

export async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

export async function getConfig() {
  try {
    const res = await fetch('/api/config');
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

/**
 * Open the session stream. On reconnect the hub resends the whole stored history, so the caller
 * must dedupe by envelope.seq (see main.js). Reconnects with capped exponential backoff.
 */
export function openSession(sessionId, { onEnvelope, onStatus }) {
  let closed = false;
  let ws = null;
  let attempt = 0;
  let timer = null;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?sessionId=${encodeURIComponent(sessionId)}`);
    ws.onopen = () => { attempt = 0; onStatus('live'); };
    ws.onmessage = (m) => {
      let env;
      try { env = JSON.parse(m.data); } catch { return; }
      if (env && typeof env.seq === 'number' && env.event && typeof env.event === 'object') onEnvelope(env);
    };
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
    ws.onclose = () => {
      if (closed) return;
      onStatus('reconnecting');
      timer = setTimeout(connect, Math.min(5000, 500 * 2 ** attempt));
      attempt += 1;
    };
  }
  onStatus('connecting');
  connect();

  return {
    close() {
      closed = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* ignore */ }
    },
  };
}
