// Shared constants. Mood and mind ids come from the Part B contract (README section 8).

export const MINDS = Object.freeze({
  perfectionist: { id: 'perfectionist', name: 'The Perfectionist', short: 'Perfectionist', tagline: 'Taste, simplicity, saying no.' },
  engineer: { id: 'engineer', name: 'The First Principles Engineer', short: 'Engineer', tagline: 'Physics, constraints, cost per unit.' },
  operator: { id: 'operator', name: 'The Scale Operator', short: 'Operator', tagline: 'Growth, distribution, first 100 users.' },
});
export const MIND_IDS = Object.freeze(Object.keys(MINDS));

export const MOOD_LABEL = Object.freeze({
  slow_clap: 'Slow clap', impressed: 'Impressed', skeptical: 'Skeptical', sarcastic: 'Sarcastic', appalled: 'Appalled',
});

// Disappointment meter value per mood (0 to 100).
export const MOOD_METER = Object.freeze({ slow_clap: 5, impressed: 20, skeptical: 45, sarcastic: 70, appalled: 95 });

// principleIds that mark comedy beats, not sourced principles. Never shown in the principle trace.
export const BEAT_PRINCIPLES = Object.freeze(['rage_quit', 'slow_clap']);

export const CLAP_SILENCE_MS = 2600;
export const VERDICT_GAP_MS = 1200;

export function mindName(id) {
  return MINDS[id]?.name ?? String(id);
}
export function mindShort(id) {
  return MINDS[id]?.short ?? String(id);
}
