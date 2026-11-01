// Mind cards: name, mood face, waveform, speech bubble.
import { h, clear } from './dom.js';
import { createFace } from './face.js';
import { MINDS, MIND_IDS, MOOD_LABEL } from './constants.js';
import { plain } from './text.js';

const BARS = 28;
const moodText = (mood) => MOOD_LABEL[mood] ?? 'Neutral';

export function createCards(container) {
  const cards = new Map();

  function build() {
    clear(container);
    cards.clear();
    for (const id of MIND_IDS) {
      const mind = MINDS[id];
      const face = createFace(id);
      const nameEl = h('h3', { class: 'card-name', text: mind.name });
      const subEl = h('p', { class: 'card-sub', text: mind.tagline });
      const tagEl = h('span', { class: 'card-tag', text: 'Waiting' });
      const bubble = h('blockquote', { class: 'bubble empty', text: 'Waiting for this mind to speak.' });
      const wave = h('div', { class: 'wave', 'aria-hidden': 'true' }, Array.from({ length: BARS }, () => h('span')));
      const gone = h('div', { class: 'gone-banner', text: 'Left the call' });
      const el = h('article', { class: 'card', 'data-mind': id, 'aria-label': mind.name },
        h('div', { class: 'card-head' }, h('div', { class: 'face' }, face.el), h('div', {}, nameEl, subEl), tagEl),
        wave, bubble, gone);
      container.append(el);
      cards.set(id, { el, face, nameEl, subEl, tagEl, bubble, id, player: false, gone: false });
    }
  }
  build();

  return {
    reset: build,
    /** Mark one mind as the human player (LARP mode). Pass null for roast mode. */
    setPlayer(mindId) {
      for (const c of cards.values()) {
        const isPlayer = c.id === mindId;
        c.player = isPlayer;
        c.el.classList.toggle('player', isPlayer);
        c.nameEl.textContent = isPlayer ? 'You' : MINDS[c.id].name;
        c.subEl.textContent = isPlayer ? `Pitching as ${MINDS[c.id].name}` : MINDS[c.id].tagline;
        c.tagEl.textContent = isPlayer ? 'You' : (c.gone ? 'Left' : 'On call');
        c.bubble.className = 'bubble empty';
        c.bubble.textContent = isPlayer ? 'Your pitch is on the table. The others do the talking.' : 'Waiting for this mind to speak.';
      }
    },
    setMood(mindId, mood) {
      const c = cards.get(mindId);
      if (!c || c.gone) return;
      c.face.setMood(mood, `${MINDS[mindId].short}: ${moodText(mood)}`);
      if (!c.player) c.tagEl.textContent = moodText(mood);
    },
    speakStart(mindId, line) {
      const c = cards.get(mindId);
      if (!c) return;
      c.el.classList.add('speaking');
      c.bubble.className = 'bubble';
      c.bubble.textContent = plain(line.text); // textContent only; the event itself is not mutated
    },
    speakEnd(mindId, { cutOff } = {}) {
      const c = cards.get(mindId);
      if (!c) return;
      c.el.classList.remove('speaking');
      if (cutOff) c.bubble.classList.add('cut');
    },
    /** Slow clap silence: all waveforms off and cards dimmed. */
    silence(on) {
      for (const c of cards.values()) {
        c.el.classList.toggle('dimmed', on);
        if (on) c.el.classList.remove('speaking');
      }
    },
    /** Rage quit: the card disconnects and stays disconnected until reset. */
    disconnect(mindId) {
      const c = cards.get(mindId);
      if (!c) return;
      c.gone = true;
      c.el.classList.remove('speaking');
      c.el.classList.add('gone');
      c.tagEl.textContent = 'Left';
      c.face.setMood('appalled', `${MINDS[mindId].short}: left the call`);
    },
  };
}
