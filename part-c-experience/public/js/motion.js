// GSAP motion layer. Every function is safe to call when gsap is missing or the user prefers reduced motion:
// it then does nothing (or the shortest possible thing) and the UI works exactly as before.
const g = () => (typeof window !== 'undefined' && window.gsap) || null;
const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const ok = () => Boolean(g()) && !calm();
const safe = (fn) => { try { return fn(); } catch { return undefined; } };

const pulses = new WeakMap();

/** Minds join the call: tiles drop in one after another, the connecting dot blinks. */
export function joinCall(els) {
  if (!ok() || !els?.length) return;
  safe(() => {
    g().killTweensOf(els);
    g().fromTo(els, { y: 26, opacity: 0, scale: 0.94 },
      { y: 0, opacity: 1, scale: 1, duration: 0.65, ease: 'back.out(1.4)', stagger: 0.18, clearProps: 'transform,opacity' });
  });
}

/** Setup screen entrance: hero lines and empty seats. */
export function enterSetup(root) {
  if (!ok() || !root) return;
  safe(() => {
    const parts = root.querySelectorAll('[data-enter]');
    g().fromTo(parts, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.09, clearProps: 'transform,opacity' });
  });
}

/** A mind starts or stops speaking: the face breathes while the audio runs. */
export function speaking(card, on) {
  const face = card?.querySelector('.face');
  if (!face || !g()) return;
  safe(() => {
    pulses.get(face)?.kill();
    pulses.delete(face);
    if (!on || calm()) { g().to(face, { scale: 1, duration: 0.2, overwrite: 'auto' }); return; }
    pulses.set(face, g().to(face, { scale: 1.07, duration: 0.42, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  });
}

/** The interrupted mind gets cut off: a short horizontal jolt and a red flash. */
export function jolt(card) {
  if (!card || !ok()) return;
  safe(() => {
    const G = g();
    G.killTweensOf(card);
    G.timeline({ onComplete: () => G.set(card, { clearProps: 'transform,boxShadow' }) })
      .to(card, { x: -12, duration: 0.05 }).to(card, { x: 11, duration: 0.06 })
      .to(card, { x: -8, duration: 0.06 }).to(card, { x: 6, duration: 0.06 })
      .to(card, { x: 0, duration: 0.1 });
    G.fromTo(card, { boxShadow: '0 0 0 2px #ff3d2e, 0 0 30px 2px rgba(255,61,46,.55)' }, { boxShadow: '0 0 0 0 rgba(255,61,46,0)', duration: 0.7, ease: 'power2.out' });
  });
}

/** Rage quit: a glitchy disconnect, then the tile dims (CSS holds the final grey state). */
export function disconnect(card) {
  if (!card) return;
  if (!ok()) return;
  safe(() => {
    const G = g();
    const face = card.querySelector('.face');
    G.killTweensOf([card, face]);
    G.timeline({ onComplete: () => G.set(card, { clearProps: 'transform,opacity,skewX,filter' }) })
      .to(card, { x: -10, skewX: 6, opacity: 0.4, duration: 0.05 })
      .to(card, { x: 12, skewX: -8, opacity: 1, duration: 0.05 })
      .to(card, { x: -6, skewX: 4, opacity: 0.2, duration: 0.05 })
      .to(card, { x: 8, skewX: -3, opacity: 0.9, duration: 0.05 })
      .to(card, { x: 0, skewX: 0, opacity: 0.55, duration: 0.25 });
    const banner = card.querySelector('.gone-banner');
    if (banner) G.fromTo(banner, { scaleX: 1.3, letterSpacing: '0.4em' }, { scaleX: 1, letterSpacing: '0.1em', duration: 0.5, ease: 'power3.out', delay: 0.25 });
  });
}

/** Slow clap: the room goes quiet, then each tile pulses once per clap. */
export function slowClap(cards, banner) {
  if (!ok()) return;
  safe(() => {
    const G = g();
    if (banner) G.fromTo(banner, { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out', clearProps: 'transform,opacity' });
    const list = [...(cards ?? [])];
    if (!list.length) return;
    const tl = G.timeline({ onComplete: () => G.set(list, { clearProps: 'transform' }) });
    for (let i = 0; i < 4; i += 1) {
      tl.to(list, { scale: 1.025, duration: 0.14, ease: 'power2.out' }, i * 0.9 + 0.3)
        .to(list, { scale: 1, duration: 0.5, ease: 'power2.inOut' }, i * 0.9 + 0.44);
    }
  });
}

/** Verdict: the card lands, the score counts up. Returns true when it took over the counting. */
export function revealVerdict(card, scoreEl, target, isStale = () => false) {
  if (!ok() || !card || !scoreEl) return false;
  return Boolean(safe(() => {
    const G = g();
    G.killTweensOf([card, scoreEl]);
    G.fromTo(card, { y: 40, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'power3.out', clearProps: 'transform,opacity' });
    const kids = card.querySelectorAll('.score-label, .v-char, .v-summary, .v-roast, .actions');
    G.from(kids, { y: 14, opacity: 0, duration: 0.5, stagger: 0.12, delay: 0.9, ease: 'power2.out', clearProps: 'transform,opacity' });
    const o = { v: 0 };
    scoreEl.textContent = '0';
    G.to(o, {
      v: target, duration: 1.6, delay: 0.35, ease: 'power3.out',
      onUpdate: () => { scoreEl.textContent = isStale() ? String(target) : String(Math.round(o.v)); },
      onComplete: () => {
        scoreEl.textContent = String(target);
        G.fromTo(scoreEl.parentElement, { scale: 1.12 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1,0.5)', clearProps: 'transform' });
      },
    });
    return true;
  }));
}

/** Meter and panel flourish when a value lands. */
export function ping(el) {
  if (!el || !ok()) return;
  safe(() => g().fromTo(el, { opacity: 0.4 }, { opacity: 1, duration: 0.5, clearProps: 'opacity' }));
}
