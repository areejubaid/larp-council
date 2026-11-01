// SVG mood faces, built with DOM calls only.
import { svg } from './dom.js';

// Per mood: eye radii, brow segments [x1,y1,x2,y2], mouth path.
const FACES = {
  neutral:   { eye: [4, 4],     browL: [28, 33, 44, 33], browR: [56, 33, 72, 33], mouth: 'M38 68 L62 68', open: false },
  slow_clap: { eye: [5, 1.4],   browL: [28, 33, 44, 31], browR: [56, 31, 72, 33], mouth: 'M34 64 Q50 80 66 64', open: false },
  impressed: { eye: [4.5, 4.5], browL: [28, 28, 44, 27], browR: [56, 27, 72, 28], mouth: 'M36 65 Q50 75 64 65', open: false },
  skeptical: { eye: [4, 3],     browL: [28, 36, 44, 31], browR: [56, 29, 72, 29], mouth: 'M38 70 L62 66', open: false },
  sarcastic: { eye: [4, 2.6],   browL: [28, 31, 44, 35], browR: [56, 29, 72, 27], mouth: 'M36 68 Q52 72 66 60', open: false },
  appalled:  { eye: [5.5, 6.5], browL: [27, 30, 44, 24], browR: [56, 24, 73, 30], mouth: 'M42 66 Q50 82 58 66 Q50 62 42 66 Z', open: true },
};

export function createFace(mindId) {
  const root = svg('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': 'Neutral face' });
  root.append(svg('circle', { class: 'head', cx: 50, cy: 52, r: 40 }));
  const eyeL = svg('ellipse', { class: 'eye', cx: 36, cy: 45 });
  const eyeR = svg('ellipse', { class: 'eye', cx: 64, cy: 45 });
  const browL = svg('line', { class: 'feat' });
  const browR = svg('line', { class: 'feat' });
  const mouth = svg('path', { class: 'feat' });
  root.append(eyeL, eyeR, browL, browR, mouth);

  // A small accessory per mind so they are tellable apart at a glance.
  if (mindId === 'perfectionist') {
    root.append(svg('circle', { class: 'feat', cx: 36, cy: 45, r: 11 }), svg('circle', { class: 'feat', cx: 64, cy: 45, r: 11 }),
      svg('line', { class: 'feat', x1: 47, y1: 45, x2: 53, y2: 45 }));
  } else if (mindId === 'engineer') {
    root.append(svg('rect', { class: 'feat', x: 22, y: 36, width: 56, height: 18, rx: 4 }));
  } else if (mindId === 'operator') {
    root.append(svg('path', { class: 'feat', d: 'M14 52 Q14 8 50 8 Q86 8 86 52' }));
  }

  function setMood(mood, label) {
    const f = FACES[mood] ?? FACES.neutral;
    for (const e of [eyeL, eyeR]) { e.setAttribute('rx', f.eye[0]); e.setAttribute('ry', f.eye[1]); }
    for (const [el, b] of [[browL, f.browL], [browR, f.browR]]) {
      el.setAttribute('x1', b[0]); el.setAttribute('y1', b[1]); el.setAttribute('x2', b[2]); el.setAttribute('y2', b[3]);
    }
    mouth.setAttribute('d', f.mouth);
    mouth.setAttribute('class', f.open ? 'feat mouth-open' : 'feat');
    root.setAttribute('aria-label', label ?? 'Face');
  }
  setMood('neutral', 'Neutral face');
  return { el: root, setMood };
}
