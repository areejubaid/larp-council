// Mind Council UI bootstrap. Wires the form, the session stream, the presenter, the voice module and the panels.
import { MINDS, MIND_IDS, mindName } from './constants.js';
import { newSessionId, plain } from './text.js';
import { h, reducedMotion, clear } from './dom.js';
import { createFace } from './face.js';
import * as motion from './motion.js';
import { createCards } from './cards.js';
import { createDashboard } from './dashboard.js';
import { createPresenter } from './presenter.js';
import { toTimingSignal } from './signals.js';
import { postJson, getConfig, openSession } from './net.js';
import { initVoice, isVoiceAvailable, playDebate, transcribePitch, stopVoice, unlockAudio } from './voice.js';

const $ = (id) => document.getElementById(id);

const els = {
  setup: $('setup'), stage: $('stage'), form: $('pitch-form'), pitch: $('pitch'), msg: $('form-msg'),
  mindPicker: $('mind-picker'), mindRow: $('mind-picker-row'), mic: $('mic-btn'), micHelp: $('mic-help'), submit: $('submit-btn'),
  conn: $('conn'), demoBadge: $('demo-badge'), voicePill: $('voice-pill'), note: $('session-note'), echo: $('pitch-echo'),
  silence: $('silence'), sr: $('sr-live'),
  deliberating: $('deliberating'), deliberatingMore: $('deliberating-more'), voiceStatus: $('voice-status'), voiceStatusText: $('voice-status-text'),
  verdict: $('verdict'), vScore: $('v-score'), vChar: $('v-char'), vSummary: $('v-summary'), vRoast: $('v-roast'), vDemo: $('v-demo'),
};

const cards = createCards($('cards'));
const dash = createDashboard({
  meters: $('meters'), idea: $('idea'), interruptions: $('interruptions'), trace: $('trace'), feed: $('feed'),
  charPanel: $('char-panel'), charMeter: $('char-meter'), charNum: $('char-num'),
});

let config = { replaySpeed: 1 };
/** Resolves once /api/config is read and the voice module has been tried. Never rejects. */
const ready = (async () => {
  config = { ...config, ...(await getConfig()) };
  await initVoice(config.voiceUrl);
  els.micHelp.textContent = isVoiceAvailable()
    ? 'The mic needs Chrome or Edge and your permission. You can always type instead.'
    : 'Voice is not connected, so type your pitch.';
})();

/** Everything that belongs to the running session. null when on the setup screen. */
let sess = null;
let micToken = 0;

// ---------- Setup form ----------
for (const id of MIND_IDS) {
  els.mindRow.append(
    h('input', { type: 'radio', name: 'mind', id: `mind-${id}`, value: id, checked: id === 'perfectionist' }),
    h('label', { for: `mind-${id}` }, h('span', { class: 'seg-title', text: MINDS[id].name }), h('span', { class: 'seg-sub', text: MINDS[id].tagline })),
  );
}
const selectedMode = () => els.form.querySelector('input[name="mode"]:checked').value;
const selectedMind = () => els.form.querySelector('input[name="mind"]:checked')?.value ?? 'perfectionist';
const syncMode = () => { els.mindPicker.hidden = selectedMode() !== 'larp'; };
els.form.addEventListener('change', syncMode);
syncMode();

// Empty chairs on the setup screen: the council waiting to be pitched at.
const seats = $('seats');
if (seats) {
  clear(seats);
  for (const id of MIND_IDS) {
    const face = createFace(id);
    seats.append(h('li', { class: 'seat', 'data-mind': id, 'data-enter': '' },
      h('div', { class: 'face' }, face.el),
      h('span', { class: 'seat-name', text: MINDS[id].short }),
      h('span', { class: 'seat-state', text: 'Waiting to join' })));
    face.setMood(id === 'operator' ? 'skeptical' : id === 'engineer' ? 'sarcastic' : 'neutral', `${MINDS[id].short}, waiting`);
  }
}
motion.enterSetup($('setup'));

function setMsg(text, info = false) {
  els.msg.textContent = text;
  els.msg.classList.toggle('info', info);
  els.msg.setAttribute('role', info || !text ? 'status' : 'alert');
  els.pitch.setAttribute('aria-invalid', String(!info && /Type a pitch/.test(text)));
}

function micMessage(err) {
  const m = String(err?.message ?? err);
  if (/not-allowed|service-not-allowed|denied/i.test(m)) return 'The microphone is blocked. Allow it for this site, or type your pitch.';
  if (/not supported|unsupported/i.test(m)) return 'This browser has no speech recognition. Use Chrome or Edge, or type your pitch.';
  if (/no-speech/i.test(m)) return 'I did not hear anything. Try again, or type your pitch.';
  if (/audio-capture/i.test(m)) return 'No microphone found. Type your pitch instead.';
  return `${m} You can still type your pitch.`;
}

let listening = false;
els.mic.addEventListener('click', async () => {
  await ready;
  if (!isVoiceAvailable()) {
    setMsg('Voice is not connected, so type your pitch.', true);
    return;
  }
  if (listening) return;
  const my = ++micToken;
  listening = true;
  els.mic.classList.add('listening');
  els.mic.querySelector('.mic-label').textContent = 'Listening... speak now';
  setMsg('Listening. Your words appear in the box as you speak.', true);
  try {
    const text = await transcribePitch({ maxMs: 45000, onInterim: (t) => { if (my === micToken) els.pitch.value = t; } });
    if (my === micToken) {
      if (text) { els.pitch.value = text; setMsg('Got it. Edit the text if you like, then press Judge my idea.', true); } else setMsg('I did not catch anything. Try again, or type your pitch.');
    }
  } catch (err) {
    if (my === micToken) setMsg(micMessage(err));
  } finally {
    listening = false;
    els.mic.classList.remove('listening');
    els.mic.querySelector('.mic-label').textContent = 'Speak your pitch';
  }
});

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const pitchText = els.pitch.value.trim();
  if (!pitchText) {
    setMsg('Type a pitch first, or try one of the demos below.');
    els.pitch.focus();
    return;
  }
  const mode = selectedMode();
  const body = { mode, pitchText, ...(mode === 'larp' ? { chosenMindId: selectedMind() } : {}) };
  begin({ mode, pitchText, call: (sessionId, voice) => postJson('/api/pitch', { ...body, sessionId, voice }) });
});

for (const btn of document.querySelectorAll('.demo-btn')) {
  btn.addEventListener('click', () => {
    const scenario = btn.dataset.scenario;
    const chosenMindId = scenario === 'larp' ? selectedMind() : undefined;
    begin({ mode: scenario === 'larp' ? 'larp' : 'roast', pitchText: '', call: (sessionId, voice) => postJson('/api/demo', { scenario, sessionId, chosenMindId, voice }) });
  });
}

$('restart-top').addEventListener('click', restart);
$('restart-btn').addEventListener('click', restart);
$('close-verdict').addEventListener('click', () => closeVerdict());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.verdict.hidden) closeVerdict(); });

// ---------- Session lifecycle ----------
let starting = false;

async function begin({ mode, pitchText, call }) {
  unlockAudio(); // inside the click, so the browser lets audio play later
  if (starting) return;
  starting = true;
  try {
    await ready;
    teardown();
    micToken += 1;
    const voice = isVoiceAvailable();
    const sessionId = newSessionId();
    const token = { sessionId, lastSeq: 0, demo: false, mode, charScore: null, timers: new Set(), voice, voiceActive: false, controller: null };
    sess = token;
    token.presenter = createPresenter(presenterHandlers(token), { speed: config.replaySpeed || 1, audio: voice });

    cards.reset();
    dash.reset();
    els.setup.hidden = true;
    els.stage.hidden = false;
    cards.join();
    els.demoBadge.hidden = true;
    els.silence.hidden = true;
    els.voiceStatus.hidden = true;
    els.note.textContent = '';
    setVoicePill(voice ? 'on' : 'off');
    els.echo.hidden = !pitchText;
    els.echo.textContent = pitchText;
    cards.setPlayer(null);
    dash.setSessionMode(mode, null);
    window.scrollTo(0, 0);

    // Open the stream first so no event is missed; the hub also replays history on connect.
    token.socket = openSession(sessionId, {
      onEnvelope: (env) => { if (sess === token) onEnvelope(token, env); },
      onStatus: (state) => {
        if (sess !== token) return;
        els.conn.dataset.state = state;
        els.conn.textContent = { live: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting' }[state] ?? state;
      },
    });

    // "The council is deliberating" while the Brain works. A cold Brain can take about a minute.
    const t1 = setTimeout(() => { els.deliberating.hidden = false; }, 400);
    const t2 = setTimeout(() => { els.deliberatingMore.hidden = false; }, 8000);
    token.timers.add(t1); token.timers.add(t2);
    const stopWaiting = () => {
      clearTimeout(t1); clearTimeout(t2);
      token.timers.delete(t1); token.timers.delete(t2);
      els.deliberating.hidden = true;
      els.deliberatingMore.hidden = true;
    };

    let res;
    try {
      res = await call(sessionId, voice);
    } catch (err) {
      stopWaiting();
      if (sess !== token) return;
      teardown();
      els.stage.hidden = true;
      els.setup.hidden = false;
      setMsg(`Could not start: ${err.message}`);
      return;
    }
    stopWaiting();
    if (sess !== token) return;
    token.demo = res.source === 'demo';
    els.demoBadge.hidden = !token.demo;
    els.note.textContent = token.demo
      ? (res.reason ? `Demo replay: ${res.reason}. These reactions are canned.` : 'Demo replay: canned reactions.')
      : 'Live from the Brain.';
    if (voice && res.script) startAudio(token, res.script);
    else if (voice) token.presenter.abandonAudio('no-script');
  } finally {
    starting = false;
  }
}

function setVoicePill(state) {
  els.voicePill.dataset.state = state;
  els.voicePill.textContent = { on: 'Voice on', off: 'Text only', stopped: 'Voice stopped' }[state];
}

/** Hand the script to Part A. Its events are timing signals only, never contract events. */
function startAudio(token, script) {
  token.controller = new AbortController();
  token.voiceActive = true;
  els.voiceStatusText.textContent = 'Warming up voices...';
  els.voiceStatus.hidden = false;
  token.presenter.audioStarting();
  let promise;
  try {
    promise = playDebate(script, {
      signal: token.controller.signal,
      onEvent: (playerEvent) => {
        if (sess !== token) return;
        const sig = toTimingSignal(playerEvent);
        if (!sig) return;
        if (sig.kind === 'audio_started') {
          els.voiceStatus.hidden = true;
          token.presenter.audioStarted(sig.lineId);
        } else {
          token.presenter.audioBeat(sig.type, sig.lineId);
        }
      },
    });
  } catch (err) {
    promise = Promise.reject(err);
  }
  Promise.resolve(promise).then(
    (r) => { if (sess === token) token.presenter.audioEnded(Boolean(r?.finished)); },
    (err) => { console.warn('playDebate failed, continuing without audio:', err?.message ?? err); if (sess === token) token.presenter.audioEnded(false); },
  );
}

function teardown() {
  if (!sess) return;
  sess.controller?.abort();
  stopVoice();
  sess.socket?.close();
  sess.presenter?.reset();
  for (const t of sess.timers) clearTimeout(t);
  sess = null;
  els.deliberating.hidden = true;
  els.voiceStatus.hidden = true;
  closeVerdict(true);
}

function restart() {
  teardown();
  cards.reset();
  dash.reset();
  els.stage.hidden = true;
  els.setup.hidden = false;
  els.silence.hidden = true;
  setMsg('');
  els.pitch.focus();
  motion.enterSetup($('setup'));
}

// ---------- Event handling ----------
function onEnvelope(token, { seq, event }) {
  // The hub resends the full history on every reconnect; only handle each sequence number once.
  if (seq <= token.lastSeq) return;
  token.lastSeq = seq;
  // Debate events reach the feed when the presenter actually plays them, so the feed never spoils the ending.
  const paced = ['line_ready', 'interruption', 'rage_quit', 'slow_clap', 'character_scored', 'verdict_ready'];
  if (paced.includes(event.type)) {
    token.feedSeq ??= new Map();
    token.feedSeq.set(event, seq);
    if (event.type === 'line_ready' && event.payload?.lineId) token.feedSeq.set(`line:${event.payload.lineId}`, [seq, event]);
  } else {
    dash.addFeed(seq, event);
  }
  const p = event.payload ?? {};
  switch (event.type) {
    case 'pitch_received': {
      const mode = p.mode === 'larp' ? 'larp' : 'roast';
      const player = mode === 'larp' && MINDS[p.chosenMindId] ? p.chosenMindId : null;
      token.mode = mode;
      token.player = player;
      cards.setPlayer(player);
      dash.setSessionMode(mode, player);
      break;
    }
    case 'idea_scored': dash.setIdeaScore(p); break;
    case 'mood_changed':
      dash.setMood(p.mindId, p.mood);
      cards.setMood(p.mindId, p.mood);
      break;
    case 'line_ready': token.presenter.pushLine(event); break;
    case 'interruption': case 'rage_quit': case 'slow_clap': case 'character_scored':
      token.presenter.pushBeat(event);
      break;
    case 'verdict_ready': token.presenter.pushVerdict(event); break;
    default: break; // audio_started, email_sent: feed only
  }
}

function presenterHandlers(token) {
  return {
    onSilence: (on) => { cards.silence(on); els.silence.hidden = !on; if (on) motion.slowClap([], els.silence); },
    onLineStart: (line) => {
      const fed = token.feedSeq?.get(`line:${line.lineId}`);
      if (fed) { token.feedSeq.delete(`line:${line.lineId}`); dash.addFeed(fed[0], fed[1]); }
      if (line.mindId === token.player) return;
      els.voiceStatus.hidden = true;
      cards.speakStart(line.mindId, line);
      cards.setMood(line.mindId, line.mood);
      dash.addTrace(line);
      els.sr.textContent = `${mindName(line.mindId)}: ${plain(line.text)}`;
    },
    onLineEnd: (line, opts) => cards.speakEnd(line.mindId, opts),
    onBeat: (event, { audio } = {}) => {
      if (token.feedSeq?.has(event)) { dash.addFeed(token.feedSeq.get(event), event); token.feedSeq.delete(event); }
      const p = event.payload ?? {};
      if (event.type === 'interruption') dash.logInterruption(p);
      else if (event.type === 'rage_quit') { cards.disconnect(p.mindId); dash.markLeft(p.mindId); }
      else if (event.type === 'character_scored') { token.charScore = p.characterScore; dash.setCharacter(p.characterScore); }
      else if (event.type === 'slow_clap') {
        // Timed mode: the slow clap line already ran the silence, so this only covers a slow_clap with no matching line.
        // Audio mode: the player reports it after the line, while the claps play.
        cards.silence(true);
        els.silence.hidden = false;
        motion.slowClap([], els.silence);
        const ms = audio ? 4500 : 2600 / (config.replaySpeed || 1);
        const t = setTimeout(() => { token.timers.delete(t); cards.silence(false); els.silence.hidden = true; }, ms);
        token.timers.add(t);
      }
    },
    onVerdict: (event) => {
      if (token.feedSeq?.has(event)) { dash.addFeed(token.feedSeq.get(event), event); token.feedSeq.delete(event); }
      showVerdict(token, event.payload ?? {});
    },
    onFallback: (reason) => {
      els.voiceStatus.hidden = true;
      if (token.voiceActive) {
        token.voiceActive = false;
        token.controller?.abort();
        stopVoice();
        setVoicePill('stopped');
        els.note.textContent = `${els.note.textContent} Voice stopped (${reason}), so the debate continues silently.`.trim();
      } else {
        setVoicePill('off');
      }
    },
  };
}

// ---------- Final screen ----------
function showVerdict(token, v) {
  const target = Number.isFinite(v.embarrassmentScore) ? Math.round(v.embarrassmentScore) : 0;
  els.vSummary.textContent = String(v.summary ?? '');
  els.vRoast.textContent = plain(v.roast ?? '');
  els.vChar.hidden = token.mode !== 'larp' || token.charScore == null;
  els.vChar.textContent = token.charScore == null ? '' : `Character Consistency: ${token.charScore}/100`;
  els.vDemo.hidden = !token.demo;
  els.verdict.hidden = false;
  $('stage').inert = true;
  $('verdict-title').focus();
  const took = target !== 0 && !reducedMotion() && motion.revealVerdict(els.verdict.querySelector('.verdict-card'), els.vScore, target, () => sess !== token || els.verdict.hidden);
  if (took) { /* GSAP is counting up */ } else if (reducedMotion() || target === 0) {
    els.vScore.textContent = String(target);
  } else {
    const start = performance.now();
    const dur = 1400;
    const step = (now) => {
      if (sess !== token || els.verdict.hidden) { els.vScore.textContent = String(target); return; }
      const k = Math.min(1, (now - start) / dur);
      els.vScore.textContent = String(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

function closeVerdict(silent = false) {
  if (els.verdict.hidden) return;
  els.verdict.hidden = true;
  $('stage').inert = false;
  if (!silent) $('restart-top').focus();
}
