// Dashboard panels: disappointment meters, idea score, character meter, interruption log,
// principle trace, live event feed. All text goes through textContent via the h() helper.
import { h, clear } from './dom.js';
import { MIND_IDS, MINDS, MOOD_LABEL, MOOD_METER, BEAT_PRINCIPLES, mindName, mindShort } from './constants.js';
import { plain, prettyId, clip } from './text.js';

const FEED_MAX = 200;
const LOG_MAX = 60;

export function createDashboard(els) {
  const rows = new Map();
  let player = null;

  function buildMeters() {
    clear(els.meters);
    rows.clear();
    for (const id of MIND_IDS) {
      const label = h('b', { text: MINDS[id].name });
      const state = h('span', { text: 'no reading yet' });
      const fill = h('div', { class: 'meter-fill' });
      const num = h('span', { class: 'meter-num', text: '--' });
      const meter = h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-label': `${MINDS[id].name} disappointment` },
        h('div', { class: 'meter-track' }, fill), num);
      const row = h('div', { class: 'meter-row' }, h('div', { class: 'meter-label' }, label, state), meter);
      els.meters.append(row);
      rows.set(id, { row, state, fill, num, meter, value: null, left: false });
    }
  }

  function updateAlarm() {
    const vals = [...rows.entries()].filter(([id, r]) => id !== player && r.value != null).map(([, r]) => r.value);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    document.documentElement.style.setProperty('--alarm', String(avg / 100));
  }

  function setList(ol, emptyText) {
    clear(ol);
    ol.append(h('li', { class: 'empty', text: emptyText }));
  }
  function prepend(ol, li, max) {
    ol.querySelector('li.empty')?.remove();
    ol.prepend(li);
    while (ol.children.length > max) ol.lastElementChild.remove();
  }

  function summarize(e) {
    const p = e.payload ?? {};
    switch (e.type) {
      case 'pitch_received': return `${p.mode ?? '?'} pitch${p.chosenMindId ? ` as ${mindShort(p.chosenMindId)}` : ''}`;
      case 'idea_scored': return `avg ${p.average} (${p.mood})`;
      case 'mood_changed': return `${mindShort(p.mindId)} is ${p.mood}`;
      case 'line_ready': return `${mindShort(p.mindId)}: ${clip(plain(p.text), 70)}`;
      case 'interruption': return `${mindShort(p.mindId)} cut off ${p.interruptsLineId}`;
      case 'rage_quit': return `${mindShort(p.mindId)} left the call`;
      case 'slow_clap': return `${mindShort(p.mindId)} slow clapped`;
      case 'character_scored': return `character ${p.characterScore}`;
      case 'verdict_ready': return `embarrassment ${p.embarrassmentScore}`;
      default: return '';
    }
  }

  function reset() {
    player = null;
    buildMeters();
    clear(els.idea);
    els.idea.append(h('p', { class: 'empty', text: 'Waiting for the scorer.' }));
    setList(els.interruptions, 'Nobody has been rude yet.');
    setList(els.trace, 'Each line will show the principle it came from.');
    clear(els.feed);
    els.charPanel.hidden = true;
    setCharacter(null);
    document.documentElement.style.setProperty('--alarm', '0');
  }

  function setCharacter(score) {
    const v = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : 0;
    els.charMeter.setAttribute('aria-valuenow', String(v));
    els.charMeter.querySelector('.meter-fill').style.setProperty('--v', String(1 - v / 100)); // low consistency = alarm colour
    els.charMeter.querySelector('.meter-fill').style.width = `${v}%`;
    els.charNum.textContent = typeof score === 'number' ? `${v}/100` : 'pending';
  }

  reset();

  return {
    reset,
    /** Called on pitch_received. In LARP mode the chosen mind is the player: no meter, show the character panel. */
    setSessionMode(mode, chosenMindId) {
      player = mode === 'larp' ? chosenMindId : null;
      for (const [id, r] of rows) r.row.classList.toggle('hidden-row', id === player);
      els.charPanel.hidden = mode !== 'larp';
      updateAlarm();
    },
    setMood(mindId, mood) {
      const r = rows.get(mindId);
      if (!r || r.left) return;
      const value = MOOD_METER[mood];
      if (value == null) return;
      r.value = value;
      r.fill.style.setProperty('--v', String(value / 100));
      r.num.textContent = String(value);
      r.state.textContent = MOOD_LABEL[mood] ?? mood;
      r.meter.setAttribute('aria-valuenow', String(value));
      updateAlarm();
    },
    markLeft(mindId) {
      const r = rows.get(mindId);
      if (!r) return;
      r.left = true;
      r.row.classList.add('left');
      r.state.textContent = 'left the call';
      updateAlarm();
    },
    setIdeaScore(s) {
      clear(els.idea);
      const row = (k, v) => h('div', { class: 'idea-row' }, h('span', { text: k }), h('b', { text: `${v}/5` }));
      els.idea.append(row('Originality', s.originality), row('Feasibility', s.feasibility), row('Effort', s.effort),
        h('div', { class: 'idea-row idea-avg' }, h('span', { text: `Average (${MOOD_LABEL[s.mood] ?? s.mood})` }), h('b', { text: String(s.average) })));
    },
    setCharacter,
    logInterruption(p) {
      prepend(els.interruptions, h('li', {},
        `${mindName(p.mindId)} cut off ${p.interruptsLineId ? 'line ' + p.interruptsLineId : 'a line'}.`), LOG_MAX);
    },
    /** Comedy-beat principleIds (rage_quit, slow_clap) are not sourced principles, so they never appear here. */
    addTrace(line) {
      if (BEAT_PRINCIPLES.includes(line.principleId)) return;
      prepend(els.trace, h('li', {}, h('b', { text: `${mindShort(line.mindId)} / ${prettyId(line.principleId)}` }),
        h('em', { text: line.sourceNote })), LOG_MAX);
    },
    addFeed(seq, e) {
      prepend(els.feed, h('li', {}, h('span', { class: 'n', text: `#${seq}` }), h('span', { class: 't', text: e.type }), summarize(e)), FEED_MAX);
    },
  };
}
