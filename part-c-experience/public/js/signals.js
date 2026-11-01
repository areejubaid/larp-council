// Part A's player.js onEvent payloads are NOT contract shapes:
//   line_ready is partial ({lineId, mindId, cached}), interruption uses interruptedLineId,
//   verdict_ready nests {verdict, characterScore}.
// So they are never forwarded to the hub and never reach the dashboard. The only thing taken from
// them is a timing signal: which line's audio just started, and when a rage quit or slow clap beat plays.

/** @returns {{kind: 'audio_started', lineId: string} | {kind: 'beat', type: 'rage_quit'|'slow_clap', lineId: string} | null} */
export function toTimingSignal(playerEvent) {
  if (!playerEvent || typeof playerEvent !== 'object') return null;
  const lineId = playerEvent.payload?.lineId;
  if (typeof lineId !== 'string' || !lineId) return null;
  switch (playerEvent.type) {
    case 'audio_started': return { kind: 'audio_started', lineId };
    case 'rage_quit': case 'slow_clap': return { kind: 'beat', type: playerEvent.type, lineId };
    default: return null; // line_ready, interruption, verdict_ready and anything else: ignored
  }
}
