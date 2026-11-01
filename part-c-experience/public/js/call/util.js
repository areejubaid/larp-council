// Pure helpers for the call UI. No DOM access, so they are unit tested in Node.

/** Remove ElevenLabs audio tags such as [laughs] or [leans in] and tidy the spaces they leave. */
export function stripAudioTags(text) {
  return String(text ?? '')
    .replace(/\[[^\]\n]{1,40}\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

/** How long to keep a caption up when no audio plays: about 60 ms per character, clamped. */
export function readingMs(text) {
  const n = stripAudioTags(text).length;
  return Math.min(9000, Math.max(1800, 900 + n * 60));
}

export function initials(name) {
  const parts = String(name ?? '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick near-black or white text, whichever reads better on the colour. */
export function textOn(hex) {
  return contrast(hex, '#ffffff') >= contrast(hex, '#10131a') ? '#ffffff' : '#10131a';
}

/** Fallback palette when the Brain sends a persona without a usable colour. */
export function safeColor(hex, i = 0) {
  if (/^#[0-9a-f]{6}$/i.test(hex ?? '')) return hex;
  return ['#c2410c', '#1d6fb8', '#0f8a5f', '#8a4fc2', '#b8860b'][i % 5];
}

export function truncate(text, max = 48) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** The single-line DebateScript Part A's player expects for one turn. */
export function buildTurnScript(turn, sessionId, idx = 0) {
  return {
    version: 1,
    sessionId,
    mode: 'roast',
    ideaScore: { originality: 3, feasibility: 3, effort: 3, average: 3, mood: 'skeptical' },
    lines: [{
      lineId: `turn-${idx}`,
      mindId: turn.speaker,
      text: turn.text,
      mood: 'skeptical',
      interruptsLineId: null,
      principleId: 'turn',
      sourceNote: 'AI simulation',
    }],
    characterScore: null,
    verdict: null,
  };
}

/** Summary text for the clipboard. */
export function summaryToText(idea, summary, nameOf = (id) => id) {
  const lines = ['LARP Council summary', `Idea: ${idea}`, '', `Verdict: ${summary.verdict ?? ''}`, ''];
  for (const p of summary.perPersona ?? []) lines.push(`${nameOf(p.speaker)} (${p.score}/10): ${p.take}`);
  if (summary.nextSteps?.length) {
    lines.push('', 'Next steps:');
    summary.nextSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  lines.push('', 'AI simulations inspired by public interviews and writing. Not the real people. No real quotes.');
  return lines.join('\n');
}
