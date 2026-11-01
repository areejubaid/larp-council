// Contract v1 validators. Mirrors part-b-brain/brain/contract.py without importing it.

export const EVENT_TYPES = Object.freeze([
  'pitch_received', 'idea_scored', 'mood_changed', 'line_ready', 'audio_started',
  'interruption', 'rage_quit', 'slow_clap', 'character_scored', 'verdict_ready', 'email_sent',
]);

export const MAX_SESSION_ID_LEN = 200; // hub-side safety cap, not in the contract
export const MAX_PITCH_LEN = 20000;    // hub-side safety cap, not in the contract

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;

function fail(error) {
  return { ok: false, error };
}

/** @returns {{ok: true} | {ok: false, error: string}} */
export function validateEvent(e) {
  if (!isObj(e)) return fail('event must be an object');
  if (e.version !== 1) return fail('version must be 1');
  if (!EVENT_TYPES.includes(e.type)) return fail(`unknown event type ${JSON.stringify(e.type)}`);
  if (!nonEmptyStr(e.sessionId)) return fail('sessionId must be a non-empty string');
  if (e.sessionId.length > MAX_SESSION_ID_LEN) return fail('sessionId too long');
  if (!isObj(e.payload)) return fail('payload must be an object');
  if (typeof e.ts !== 'number' || !Number.isFinite(e.ts)) return fail('ts must be a number');
  return { ok: true };
}

/** Same rules as validate_pitch_input in contract.py. */
export function validatePitchInput(p) {
  if (!isObj(p)) return fail('PitchInput must be an object');
  if (!nonEmptyStr(p.sessionId)) return fail('sessionId required');
  if (p.sessionId.length > MAX_SESSION_ID_LEN) return fail('sessionId too long');
  if (p.mode !== 'larp' && p.mode !== 'roast') return fail("mode must be 'larp' or 'roast'");
  if (!nonEmptyStr(p.pitchText)) return fail('pitchText required');
  if (p.pitchText.length > MAX_PITCH_LEN) return fail('pitchText too long');
  if (p.mode === 'larp' && !nonEmptyStr(p.chosenMindId)) return fail('chosenMindId required in larp mode');
  return { ok: true };
}

export const MOODS = Object.freeze(['slow_clap', 'impressed', 'skeptical', 'sarcastic', 'appalled']);

/** Mirrors validate_debate_script in contract.py. */
export function validateDebateScript(d) {
  if (!isObj(d)) return fail('script must be an object');
  if (d.version !== 1) return fail('version must be 1');
  if (typeof d.sessionId !== 'string') return fail('sessionId required');
  if (d.mode !== 'larp' && d.mode !== 'roast') return fail('mode invalid');
  const s = d.ideaScore;
  if (!isObj(s)) return fail('ideaScore required');
  for (const k of ['originality', 'feasibility', 'effort']) {
    if (!Number.isInteger(s[k]) || s[k] < 1 || s[k] > 5) return fail(`${k} must be an int 1-5`);
  }
  if (typeof s.average !== 'number' || s.average < 1 || s.average > 5) return fail('average must be 1-5');
  if (!MOODS.includes(s.mood)) return fail('ideaScore.mood invalid');
  if (!Array.isArray(d.lines) || d.lines.length === 0) return fail('lines must be a non-empty list');
  const seen = [];
  for (const line of d.lines) {
    if (!isObj(line)) return fail('line must be an object');
    for (const k of ['lineId', 'mindId', 'text', 'mood', 'principleId', 'sourceNote']) {
      if (!nonEmptyStr(line[k])) return fail(`line.${k} must be a non-empty string`);
    }
    if (!MOODS.includes(line.mood)) return fail('line.mood invalid');
    const ref = line.interruptsLineId;
    if (ref != null && !seen.includes(ref)) return fail('interruptsLineId must be null or an earlier lineId');
    seen.push(line.lineId);
  }
  const cs = d.characterScore;
  if (cs != null && !(Number.isInteger(cs) && cs >= 0 && cs <= 100)) return fail('characterScore must be null or 0-100');
  const v = d.verdict;
  if (!isObj(v)) return fail('verdict required');
  if (!Number.isInteger(v.embarrassmentScore) || v.embarrassmentScore < 0 || v.embarrassmentScore > 100) return fail('embarrassmentScore 0-100');
  if (!nonEmptyStr(v.summary)) return fail('verdict.summary required');
  if (!nonEmptyStr(v.roast)) return fail('verdict.roast required');
  return { ok: true };
}
