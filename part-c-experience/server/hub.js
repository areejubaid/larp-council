// In-memory session store and broadcast. Transport-agnostic: index.js wires it to WebSockets.

export class Hub {
  constructor({ maxEventsPerSession = 500, maxSessions = 200 } = {}) {
    this.maxEventsPerSession = maxEventsPerSession;
    this.maxSessions = maxSessions;
    /** @type {Map<string, {nextSeq: number, entries: Array<{seq: number, event: object}>}>} insertion order = age */
    this.sessions = new Map();
    /** @type {Map<string, Set<Function>>} */
    this.subs = new Map();
  }

  /** Store an already validated event and push it to live subscribers. Returns the envelope. */
  publish(sessionId, event) {
    let s = this.sessions.get(sessionId);
    if (!s) {
      this.#evictIfNeeded();
      s = { nextSeq: 1, entries: [] };
      this.sessions.set(sessionId, s);
    }
    const envelope = { seq: s.nextSeq++, event };
    s.entries.push(envelope);
    if (s.entries.length > this.maxEventsPerSession) s.entries.shift();
    const set = this.subs.get(sessionId);
    if (set) {
      for (const fn of [...set]) {
        try { fn(envelope); } catch { /* one bad subscriber must not stop the rest */ }
      }
    }
    return envelope;
  }

  history(sessionId) {
    const s = this.sessions.get(sessionId);
    return s ? [...s.entries] : [];
  }

  /** Returns an unsubscribe function. */
  subscribe(sessionId, fn) {
    let set = this.subs.get(sessionId);
    if (!set) this.subs.set(sessionId, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0 && this.subs.get(sessionId) === set) this.subs.delete(sessionId);
    };
  }

  /** Evict the oldest session, preferring one nobody is watching. */
  #evictIfNeeded() {
    while (this.sessions.size >= this.maxSessions) {
      let victim = null;
      for (const id of this.sessions.keys()) {
        if (!this.subs.has(id)) { victim = id; break; }
      }
      victim ??= this.sessions.keys().next().value;
      this.sessions.delete(victim);
    }
  }
}
