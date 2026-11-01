// Build a DebateScript (contract v1) from a list of events, so demo replays can be spoken by Part A.
import { validateDebateScript } from './validate.js';

/**
 * Pure. Takes contract events and returns a DebateScript. Throws if the events lack what the
 * script needs (an idea score, at least one line, a verdict), so a broken stream is caught early.
 */
export function buildScript(events, sessionId) {
  const first = (type) => events.find((e) => e.type === type)?.payload;
  const pitch = first('pitch_received') ?? {};
  const script = {
    version: 1,
    sessionId: sessionId ?? events[0]?.sessionId ?? '',
    mode: pitch.mode === 'larp' ? 'larp' : 'roast',
    ideaScore: structuredClone(first('idea_scored') ?? {}),
    lines: events.filter((e) => e.type === 'line_ready').map((e) => structuredClone(e.payload)),
    characterScore: first('character_scored')?.characterScore ?? null,
    verdict: structuredClone(first('verdict_ready') ?? {}),
  };
  const v = validateDebateScript(script);
  if (!v.ok) throw new Error(`cannot build a valid DebateScript: ${v.error}`);
  return script;
}
