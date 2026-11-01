// Text helpers. Pure functions, no DOM, so they are unit tested from Node.

/** Strip bracketed audio tags such as [deadpan] or [interrupting]. Returns a new string; never mutates input. */
export function plain(text) {
  return String(text ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Mock speaking time for a line, in ms. Mirrors the replay pacing on the server. */
export function lineDuration(text) {
  const ms = 1000 + 48 * plain(text).length;
  return Math.min(6200, Math.max(2400, ms));
}

export function prettyId(id) {
  return String(id ?? '').replace(/_/g, ' ');
}

export function clip(text, max) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function newSessionId() {
  if (globalThis.crypto?.randomUUID) return `s-${globalThis.crypto.randomUUID()}`;
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
