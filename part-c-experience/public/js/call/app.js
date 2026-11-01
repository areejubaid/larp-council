// LARP Council: call UI. Landing, call loop, summary.
// Talks only to the hub (/api/personas, /api/turn, /api/config) and Part A's voice module via ../voice.js.
import { initVoice, isVoiceAvailable, playDebate, transcribePitch, stopVoice, unlockAudio } from '/js/voice.js';
import { stripAudioTags, readingMs, initials, textOn, safeColor, truncate, formatClock, buildTurnScript, summaryToText } from './util.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const canAnimate = () => typeof window.gsap !== 'undefined' && !reduceMotion();
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
  personas: [],
  selected: new Set(),
  sessionId: '',
  idea: '',
  history: [],
  turnCount: 0,
  requesting: false,
  runId: 0,
  pending: [],
  awaiting: false,
  ended: false,
  speakerId: null,
  playCtl: null,      // AbortController for the current persona audio
  generation: 0,      // bumped when the call is left, so late async work is dropped
  startedAt: 0,
  timerId: 0,
  lastRequest: null,  // () => Promise, used by the Retry button
  summary: null,
  mic: { active: false, rec: null, holdStart: 0, wasIdle: false, suppressClick: false },
  panelTab: 'chat',
};
const tiles = new Map(); // id -> element

/* ---------------- small helpers ---------------- */
function show(id) {
  for (const s of ['screen-landing', 'screen-call', 'screen-summary']) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
}
function toast(msg, ms = 6000) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.id);
  toast.id = setTimeout(() => { t.hidden = true; }, ms);
}
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); signal?.removeEventListener('abort', done); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  });
}
function personaById(id) { return state.personas.find((p) => p.id === id); }
function nameOf(id) { return id === 'user' ? 'You' : (personaById(id)?.name ?? id); }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function icon(id) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('class', 'ic');
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVG_NS, 'use');
  u.setAttribute('href', `#${id}`);
  s.appendChild(u);
  return s;
}
function paint(node, persona, i = 0) {
  const c = safeColor(persona.color, i);
  node.style.setProperty('--c', c);
  node.style.setProperty('--tc', textOn(c));
}
function animate(fn) { if (canAnimate()) { try { fn(window.gsap); } catch { /* animation is optional */ } } }

/* ---------------- landing ---------------- */
async function loadPersonas() {
  const list = $('persona-list');
  $('persona-error').hidden = true;
  $('persona-retry-row').hidden = true;
  list.replaceChildren(el('p', 'state', 'Loading the council...'));
  $('join-btn').disabled = true;
  try {
    const res = await fetch('/api/personas', { headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data) || data.length === 0) throw new Error(data?.message || 'bad reply');
    state.personas = data;
    state.selected = new Set(data.map((p) => p.id));
    renderPicks();
  } catch (err) {
    list.replaceChildren();
    $('persona-error').textContent = 'The council is offline right now. ' + (err?.message && err.message !== 'bad reply' ? err.message : 'Check your connection and try again.');
    $('persona-error').hidden = false;
    $('persona-retry-row').hidden = false;
  }
  updateJoin();
}
function renderPicks() {
  const list = $('persona-list');
  list.replaceChildren();
  state.personas.forEach((p, i) => {
    const label = el('label', 'pick');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = state.selected.has(p.id);
    input.value = p.id;
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(p.id); else state.selected.delete(p.id);
      updateJoin();
    });
    const card = el('span', 'pick-card');
    paint(card, p, i);
    const av = el('span', 'mini-avatar', initials(p.name));
    av.setAttribute('aria-hidden', 'true');
    const text = el('span', 'pick-text');
    text.append(el('span', 'pick-name', p.name), el('span', 'pick-role', p.role || p.lens || ''));
    const check = el('span', 'pick-check');
    check.setAttribute('aria-hidden', 'true');
    check.appendChild(icon('i-check'));
    card.append(av, text, check);
    label.append(input, card);
    list.appendChild(label);
  });
  animate((g) => g.from('#persona-list .pick', { opacity: 0, y: 12, duration: 0.4, stagger: 0.06, ease: 'power2.out', clearProps: 'transform,opacity' }));
}
function updateJoin() {
  const n = state.selected.size;
  const btn = $('join-btn');
  btn.disabled = state.personas.length === 0 || n < 2;
  if (state.personas.length && n < 2) {
    $('persona-error').textContent = 'Pick at least two people for the call.';
    $('persona-error').hidden = false;
  } else if (state.personas.length) {
    $('persona-error').hidden = true;
  }
}
function setIdeaError(msg) {
  const e = $('idea-error');
  e.textContent = msg || '';
  e.hidden = !msg;
  $('idea').setAttribute('aria-invalid', msg ? 'true' : 'false');
}

/* ---------------- call setup ---------------- */
function newSessionId() {
  return 'lc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function buildTiles() {
  const grid = $('grid');
  grid.replaceChildren();
  tiles.clear();
  const members = state.personas.filter((p) => state.selected.has(p.id));
  grid.dataset.count = String(members.length + 1);
  members.forEach((p, i) => grid.appendChild(makeTile(p, i, false)));
  grid.appendChild(makeTile({ id: 'user', name: 'You', role: 'Host', color: '#5b6b8c' }, members.length, true));
  buildPeople(members);
  animate((g) => g.from('#grid .tile', { opacity: 0, y: 28, scale: 0.94, duration: 0.55, stagger: 0.08, ease: 'power3.out', clearProps: 'transform,opacity' }));
}
function makeTile(p, i, isYou) {
  const t = el('div', 'tile' + (isYou ? ' is-you' : ''));
  t.setAttribute('role', 'listitem');
  t.dataset.id = p.id;
  paint(t, p, i);
  if (isYou) t.style.setProperty('--tc', '#ffffff');
  const av = el('div', 'avatar', isYou ? 'You' : initials(p.name));
  av.setAttribute('aria-hidden', 'true');
  if (isYou) av.style.fontSize = 'clamp(1.1rem, 11cqmin, 2.5rem)';
  const mic = el('div', 'tile-mic');
  mic.setAttribute('aria-hidden', 'true');
  const off = icon('i-mic-off'); off.classList.add('off');
  const bars = el('span', 'bars');
  bars.append(el('i'), el('i'), el('i'), el('i'));
  mic.append(off, bars);
  const label = el('div', 'tile-label');
  label.append(el('span', 'name', p.name));
  const think = el('div', 'tile-think');
  think.append(el('span', null, 'Thinking'), el('i'), el('i'), el('i'));
  think.setAttribute('aria-hidden', 'true');
  const chip = el('div', 'tile-chip', 'Your turn');
  t.append(av, mic, think, chip, label);
  tiles.set(p.id, t);
  return t;
}
function buildPeople(members) {
  const ul = $('people');
  ul.replaceChildren();
  const rows = [{ id: 'user', name: 'You (host)', color: '#5b6b8c' }, ...members];
  rows.forEach((p, i) => {
    const li = el('li', 'person');
    li.dataset.id = p.id;
    paint(li, p, i);
    const av = el('span', 'mini-avatar', p.id === 'user' ? 'You' : initials(p.name));
    av.setAttribute('aria-hidden', 'true');
    if (p.id === 'user') av.style.setProperty('--tc', '#ffffff');
    const text = el('span', 'person-text');
    text.append(el('span', 'person-name', p.name), el('span', 'person-state', p.id === 'user' ? 'Mic ready' : (p.role || 'AI persona')));
    li.append(av, text);
    ul.appendChild(li);
  });
}
function setPersonState(id, label, active) {
  const li = $('people').querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!li) return;
  li.classList.toggle('active', Boolean(active));
  const s = li.querySelector('.person-state');
  if (s) s.textContent = label;
}

/* ---------------- tile + caption state ---------------- */
function setSpeaker(id) {
  const prev = state.speakerId;
  if (prev && tiles.get(prev)) {
    const t = tiles.get(prev);
    t.classList.remove('speaking');
    const base = personaById(prev)?.role || 'AI persona';
    setPersonState(prev, base, false);
    animate((g) => g.to(t.querySelector('.avatar'), { scale: 1, duration: 0.3, ease: 'power2.out' }));
  }
  state.speakerId = id;
  if (id && tiles.get(id)) {
    const t = tiles.get(id);
    t.classList.add('speaking');
    t.classList.remove('thinking');
    setPersonState(id, 'Speaking', true);
    animate((g) => g.fromTo(t.querySelector('.avatar'), { scale: 0.96 }, { scale: 1.06, duration: 0.4, ease: 'back.out(2.2)' }));
  }
}
function setThinking(on, onlyId) {
  for (const [id, t] of tiles) {
    if (id === 'user') continue;
    t.classList.toggle('thinking', on && (!onlyId || id === onlyId));
  }
}
const STANCES = { agrees: 'Agrees', agree: 'Agrees', disagrees: 'Disagrees', disagree: 'Disagrees', challenges: 'Challenges', challenge: 'Challenges', asks: 'Asks', ask: 'Asks', advises: 'Advises', advise: 'Advises' };
function stanceLabel(st) { return STANCES[String(st ?? '').toLowerCase().trim()] || ''; }
function replyLabel(turn) {
  const to = turn?.replyTo;
  if (!to || typeof to !== 'string' || to === 'user' || to === turn.speaker || !personaById(to)) return '';
  return 'replying to ' + nameOf(to);
}
function setCaption(speakerName, text, color, tag = '') {
  const body = $('captions');
  $('cap-speaker').textContent = speakerName ? speakerName + ':' : '';
  let t = $('cap-tag');
  if (!t) { t = el('span', 'cap-tag'); t.id = 'cap-tag'; $('cap-speaker').after(t); }
  t.textContent = tag;
  t.hidden = !tag;
  $('cap-text').textContent = text;
  if (color) $('cap-speaker').style.setProperty('--c', color);
  body.classList.toggle('empty', !text);
  animate((g) => g.fromTo(body, { opacity: 0.2, y: 6 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' }));
}
function setStatus(text) { $('captions-status').textContent = text; }
function clearCaption() { $('cap-speaker').textContent = ''; $('cap-text').textContent = ''; $('captions').classList.add('empty'); }

function setAwaiting(on, askerId) {
  state.awaiting = on;
  const you = tiles.get('user');
  you?.classList.toggle('awaiting', on);
  if (on) {
    const who = nameOf(askerId);
    setStatus(`${who} asked you something. Answer by voice or text.`);
    $('reply').placeholder = `Answer ${who}`;
    setPersonState('user', 'Your turn', true);
    $('reply').focus({ preventScroll: true });
  } else {
    $('reply').placeholder = 'Type your answer';
    setPersonState('user', 'Mic ready', false);
  }
}

/* ---------------- transcript ---------------- */
function addChat(speaker, text, turn) {
  $('chat-empty').hidden = true;
  const me = speaker === 'user';
  const li = el('li', 'msg' + (me ? ' me' : ''));
  const who = el('span', 'msg-who');
  if (!me) {
    const dot = el('span', 'msg-dot');
    paint(dot, personaById(speaker) ?? {}, 0);
    dot.setAttribute('aria-hidden', 'true');
    who.append(dot);
  }
  who.append(document.createTextNode(nameOf(speaker)));
  const rl = turn ? replyLabel(turn) : '';
  if (rl) who.append(el('span', 'msg-reply', rl));
  const sl = turn ? stanceLabel(turn.stance) : '';
  if (sl) { const c = el('span', 'stance stance-' + sl.toLowerCase(), sl); who.append(c); }
  li.append(who, el('span', 'msg-text', stripAudioTags(text)));
  const chat = $('chat');
  chat.appendChild(li);
  const pane = $('pane-chat');
  pane.scrollTop = pane.scrollHeight;
}

/* ---------------- panel ---------------- */
function openPanel(tab) {
  state.panelTab = tab;
  $('panel').hidden = false;
  const chat = tab === 'chat';
  $('tab-chat').setAttribute('aria-selected', String(chat));
  $('tab-people').setAttribute('aria-selected', String(!chat));
  $('tab-chat').tabIndex = chat ? 0 : -1;
  $('tab-people').tabIndex = chat ? -1 : 0;
  $('pane-chat').hidden = !chat;
  $('pane-people').hidden = chat;
  $('chat-btn').setAttribute('aria-expanded', String(chat));
  $('people-btn').setAttribute('aria-expanded', String(!chat));
  animate((g) => g.from('#panel', { x: 24, opacity: 0, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' }));
}
function closePanel() {
  $('panel').hidden = true;
  $('chat-btn').setAttribute('aria-expanded', 'false');
  $('people-btn').setAttribute('aria-expanded', 'false');
}
function togglePanel(tab) {
  if (!$('panel').hidden && state.panelTab === tab) { closePanel(); (tab === 'chat' ? $('chat-btn') : $('people-btn')).focus(); }
  else openPanel(tab);
}

/* ---------------- timer ---------------- */
function startTimer() {
  clearInterval(state.timerId);
  state.startedAt = Date.now();
  $('timer').textContent = '00:00';
  state.timerId = setInterval(() => { $('timer').textContent = formatClock((Date.now() - state.startedAt) / 1000); }, 1000);
}

/* ---------------- conversation loop ---------------- */
function setRequesting(on) {
  state.requesting = on;
  $('send-btn').disabled = on;
  $('wrap-btn').disabled = on || state.ended;
  $('mic-btn').disabled = on && !state.mic.active;
}

async function postTurn(endCall) {
  const payload = {
    sessionId: state.sessionId,
    idea: state.idea,
    personas: [...state.selected],
    history: state.history,
    endCall: Boolean(endCall),
  };
  let res;
  try {
    res = await fetch('/api/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new Error('We could not reach the council. Check your connection.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !Array.isArray(data.turns)) {
    throw new Error(data?.message || (res.status === 502 ? 'The council is not answering right now.' : 'The council sent something unexpected.'));
  }
  return data;
}

async function runTurn(endCall) {
  const gen = state.generation;
  const run = ++state.runId;
  const stale = () => gen !== state.generation || run !== state.runId;
  $('call-error').hidden = true;
  setRequesting(true);
  setThinking(true);
  setStatus(endCall ? 'The council is writing up its notes...' : 'The council is thinking');
  state.lastRequest = () => runTurn(endCall);
  let data;
  try {
    data = await postTurn(endCall);
  } catch (err) {
    if (stale()) return;
    setThinking(false);
    setRequesting(false);
    setStatus('Connection problem');
    $('call-error-text').textContent = err.message;
    $('call-error').hidden = false;
    $('retry-btn').focus({ preventScroll: true });
    return;
  }
  if (stale()) return;
  setThinking(false);
  setRequesting(false);
  state.playCtl = new AbortController();
  const ctl = state.playCtl;
  state.pending = [...data.turns];
  while (state.pending.length) {
    const turn = state.pending.shift();
    await presentTurn(turn, ctl);
    if (stale()) return;
  }
  if (ctl.signal.aborted) return; // the user took over while the council was talking
  setSpeaker(null);
  if (data.done) {
    state.ended = true;
    showSummary(data.summary);
    return;
  }
  if (data.awaitingUser !== false) {
    const last = data.turns[data.turns.length - 1];
    setAwaiting(true, last?.speaker);
  } else {
    runTurn(false);
  }
}

async function presentTurn(turn, ctl) {
  const speaker = turn.speaker;
  const p = personaById(speaker);
  const text = String(turn.text ?? '');
  const clean = stripAudioTags(text);
  state.history.push({ speaker, text });
  state.turnCount += 1;
  const idx = state.turnCount;
  let shown = false;
  const showNow = () => {
    if (shown) return;
    shown = true;
    setThinking(false);
    setSpeaker(speaker);
    setCaption(p?.name ?? speaker, clean, safeColor(p?.color), [replyLabel(turn), stanceLabel(turn.stance)].filter(Boolean).join(' · '));
    setStatus('');
    addChat(speaker, text, turn);
  };
  if (ctl.signal.aborted) { showNow(); setSpeaker(null); return; } // user cut in: log it, no audio
  let played = false;
  if (isVoiceAvailable()) {
    if (tiles.get(speaker)) tiles.get(speaker).classList.add('thinking');
    try {
      const aborted = new Promise((resolve) => ctl.signal.addEventListener('abort', () => resolve({ finished: false }), { once: true }));
      const r = await Promise.race([
        playDebate(buildTurnScript(turn, state.sessionId, idx), {
          signal: ctl.signal,
          onEvent: (ev) => { if (ev?.type === 'audio_started') showNow(); },
        }),
        aborted,
      ]);
      played = shown && r?.finished !== false;
    } catch (err) {
      console.warn('Voice playback failed, using captions only:', err?.message ?? err);
    }
  }
  showNow();
  if (!played && !ctl.signal.aborted) await sleep(readingMs(text), ctl.signal);
  if (!ctl.signal.aborted) await sleep(250, ctl.signal);
}

function interruptCouncil() {
  if (state.playCtl && !state.playCtl.signal.aborted) state.playCtl.abort();
  stopVoice();
  // Turns the council had queued are logged now, so history stays in the order things were said.
  while (state.pending.length) {
    const t = state.pending.shift();
    state.history.push({ speaker: t.speaker, text: t.text });
    addChat(t.speaker, t.text, t);
  }
}

function sendAnswer(text, endCall = false) {
  interruptCouncil();
  const clean = String(text ?? '').trim();
  if (clean) {
    state.history.push({ speaker: 'user', text: clean });
    addChat('user', clean);
    setCaption('You', clean, '#ffffff');
  }
  $('reply').value = '';
  setAwaiting(false);
  setSpeaker(null);
  runTurn(endCall);
}

/* ---------------- mic ---------------- */
function grabRecognizer() {
  const key = window.SpeechRecognition ? 'SpeechRecognition' : (window.webkitSpeechRecognition ? 'webkitSpeechRecognition' : '');
  if (!key) return () => {};
  const Orig = window[key];
  window[key] = function Wrapped() { const r = new Orig(); state.mic.rec = r; return r; };
  return () => { window[key] = Orig; };
}
async function startMic() {
  if (state.mic.active || state.ended) return;
  if (!isVoiceAvailable()) {
    toast('Voice is not connected here. Type your answer instead.');
    return;
  }
  interruptCouncil();
  state.mic.active = true;
  state.mic.rec = null;
  $('mic-btn').setAttribute('aria-pressed', 'true');
  tiles.get('user')?.classList.add('listening');
  tiles.get('user')?.classList.remove('awaiting');
  setStatus('Listening... speak your answer, then tap the mic again.');
  setPersonState('user', 'Speaking', true);
  const restore = grabRecognizer();
  let text = '';
  try {
    const pending = transcribePitch({ onInterim: (t) => { $('reply').value = t; } });
    restore();
    text = await pending;
  } catch (err) {
    restore();
    const msg = String(err?.message ?? '');
    toast(/not-allowed|denied|service-not-allowed/.test(msg) ? 'Microphone is blocked. Allow it in your browser, or type your answer.' : (msg || 'The microphone did not work. Type your answer instead.'));
  }
  state.mic.active = false;
  $('mic-btn').setAttribute('aria-pressed', 'false');
  tiles.get('user')?.classList.remove('listening');
  setPersonState('user', 'Mic ready', false);
  const final = (text || $('reply').value).trim();
  if (final && !state.ended) sendAnswer(final);
  else if (!state.ended) { setStatus('Did not catch that. Try again or type your answer.'); setAwaiting(true, state.history.at(-1)?.speaker); }
}
function stopMic() { try { state.mic.rec?.stop(); } catch { /* already stopped */ } }

/* ---------------- summary ---------------- */
function showSummary(summary) {
  clearInterval(state.timerId);
  stopVoice();
  const s = summary && typeof summary === 'object' ? summary : { verdict: 'The call has ended.', perPersona: [], nextSteps: [] };
  state.summary = s;
  $('summary-idea').textContent = 'Your idea: ' + truncate(state.idea, 140);
  $('summary-verdict').textContent = s.verdict || 'The council has spoken.';
  const takes = $('summary-takes');
  takes.replaceChildren();
  (s.perPersona ?? []).forEach((pp, i) => {
    const p = personaById(pp.speaker) ?? { name: pp.speaker, role: '' };
    const li = el('li', 'take');
    paint(li, p, i);
    const head = el('div', 'take-head');
    const av = el('span', 'mini-avatar', initials(p.name)); av.setAttribute('aria-hidden', 'true');
    const nm = el('div'); nm.append(el('div', 'take-name', p.name), el('div', 'take-role', p.role || ''));
    const score = el('div', 'score'); score.style.color = safeColor(p.color, i); score.append(document.createTextNode(String(pp.score ?? '-')), el('small', null, '/10'));
    score.setAttribute('aria-label', `Score ${pp.score ?? 'none'} out of 10`);
    head.append(av, nm, score);
    li.append(head, el('p', 'take-text', pp.take || ''));
    takes.appendChild(li);
  });
  if (!(s.perPersona ?? []).length) takes.appendChild(el('li', 'state', 'No individual takes came back for this call.'));
  const steps = $('summary-steps');
  steps.replaceChildren();
  (s.nextSteps ?? []).forEach((t) => steps.appendChild(el('li', null, t)));
  if (!(s.nextSteps ?? []).length) steps.appendChild(el('li', null, 'No next steps this time. Start a new call to dig deeper.'));
  show('screen-summary');
  const main = $('main-summary');
  main.focus({ preventScroll: true });
  animate((g) => {
    const tl = g.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('#summary-title', { y: 20, opacity: 0, duration: 0.5, clearProps: 'transform,opacity' })
      .from('#summary-verdict', { y: 20, opacity: 0, duration: 0.5, clearProps: 'transform,opacity' }, '-=0.3')
      .from('#summary-takes .take', { y: 28, opacity: 0, duration: 0.5, stagger: 0.1, clearProps: 'transform,opacity' }, '-=0.2')
      .from('#summary-steps li', { x: -16, opacity: 0, duration: 0.4, stagger: 0.08, clearProps: 'transform,opacity' }, '-=0.2')
      .from('.summary-actions', { opacity: 0, duration: 0.4, clearProps: 'transform,opacity' }, '-=0.1');
  });
}

/* ---------------- start / leave ---------------- */
function resetCall() {
  state.generation += 1;
  state.pending = [];
  interruptCouncil();
  stopMic();
  clearInterval(state.timerId);
  Object.assign(state, { history: [], pending: [], turnCount: 0, requesting: false, awaiting: false, ended: false, speakerId: null, summary: null, lastRequest: null });
  state.mic.active = false;
  $('chat').replaceChildren();
  $('chat-empty').hidden = false;
  $('reply').value = '';
  $('call-error').hidden = true;
  $('mic-btn').setAttribute('aria-pressed', 'false');
  closePanel();
  clearCaption();
}
function startCall() {
  const idea = $('idea').value.trim();
  if (!idea) {
    setIdeaError("Tell the council what you want their take on. A sentence is enough.");
    $('idea').focus();
    return;
  }
  setIdeaError('');
  if (state.selected.size < 2) return;
  unlockAudio();
  resetCall();
  state.idea = idea;
  state.sessionId = newSessionId();
  $('call-title').textContent = truncate(idea, 60);
  $('call-title').title = idea;
  buildTiles();
  setRequesting(false);
  show('screen-call');
  startTimer();
  runTurn(false);
}
function leaveCall() {
  resetCall();
  show('screen-landing');
  $('idea').focus({ preventScroll: true });
}

/* ---------------- wiring ---------------- */
function wire() {
  $('join-form').addEventListener('submit', (e) => { e.preventDefault(); startCall(); });
  $('persona-retry').addEventListener('click', loadPersonas);
  $('idea').addEventListener('input', () => { if ($('idea-error').textContent) setIdeaError(''); });
  $('idea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startCall(); }
  });
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    $('idea').value = b.dataset.idea;
    setIdeaError('');
    $('idea').focus();
  });

  $('reply-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.ended) return;
    const text = $('reply').value.trim();
    if (!text) { toast('Type an answer first, or use the mic.', 3000); $('reply').focus(); return; }
    if (state.requesting) return;
    sendAnswer(text);
  });
  $('wrap-btn').addEventListener('click', () => {
    if (state.ended) return;
    if (state.requesting) return;
    sendAnswer($('reply').value, true);
  });
  $('retry-btn').addEventListener('click', () => state.lastRequest?.());
  $('leave-btn').addEventListener('click', leaveCall);
  $('chat-btn').addEventListener('click', () => togglePanel('chat'));
  $('people-btn').addEventListener('click', () => togglePanel('people'));
  $('panel-close').addEventListener('click', () => { closePanel(); $('chat-btn').focus(); });
  $('tab-chat').addEventListener('click', () => openPanel('chat'));
  $('tab-people').addEventListener('click', () => openPanel('people'));
  $('panel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePanel(); $('chat-btn').focus(); }
    if (e.target.classList?.contains('tab') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const next = state.panelTab === 'chat' ? 'people' : 'chat';
      openPanel(next);
      $(next === 'chat' ? 'tab-chat' : 'tab-people').focus();
    }
  });

  // Mic: tap to toggle, or hold to talk and release to send.
  const mic = $('mic-btn');
  mic.addEventListener('pointerdown', () => {
    state.mic.holdStart = Date.now();
    state.mic.wasIdle = !state.mic.active;
  });
  mic.addEventListener('pointerup', () => {
    if (state.mic.wasIdle && state.mic.active && Date.now() - state.mic.holdStart > 650) {
      state.mic.suppressClick = true;
      stopMic();
    }
  });
  mic.addEventListener('click', () => {
    if (state.mic.suppressClick) { state.mic.suppressClick = false; return; }
    if (state.mic.active) stopMic(); else startMic();
  });

  $('new-call-btn').addEventListener('click', () => { resetCall(); show('screen-landing'); $('idea').value = ''; $('idea').focus({ preventScroll: true }); });
  $('copy-btn').addEventListener('click', async () => {
    const text = summaryToText(state.idea, state.summary ?? {}, nameOf);
    try {
      await navigator.clipboard.writeText(text);
      toast('Summary copied.', 2500);
    } catch {
      const ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Summary copied.', 2500); } catch { toast('Copy is blocked in this browser.'); }
      ta.remove();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('panel').hidden && $('screen-call').hidden === false) closePanel();
  });
}

async function boot() {
  wire();
  animate((g) => g.from('.landing-copy > *, .join-card', { y: 22, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out', clearProps: 'transform,opacity' }));
  loadPersonas();
  try {
    const cfg = await (await fetch('/api/config')).json();
    if (cfg.voiceUrl) await initVoice(cfg.voiceUrl);
  } catch { /* text only */ }
}
boot();
