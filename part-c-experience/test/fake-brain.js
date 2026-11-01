// A tiny fake Brain for tests and manual runs: GET /personas and POST /turn with canned turns.
//   node test/fake-brain.js            (PORT, default 8011)
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PERSONAS = [
  { id: 'jobs', name: 'Steve Jobs', role: 'Apple co-founder', lens: 'Taste, focus, saying no', color: '#e8590c' },
  { id: 'musk', name: 'Elon Musk', role: 'Tesla and SpaceX CEO', lens: 'First principles, speed', color: '#1971c2' },
  { id: 'altman', name: 'Sam Altman', role: 'OpenAI CEO', lens: 'Scale and leverage', color: '#2f9e44' },
  { id: 'buffett', name: 'Warren Buffett', role: 'Berkshire Hathaway chair', lens: 'Moats, durable value', color: '#9c36b5' },
];

const SCRIPT = [
  [{ speaker: 'jobs', text: "[leans in] Okay, I have seen this before. What is different about yours, and what are you saying no to?", mood: 'skeptical', stance: 'question', replyTo: 'user' }],
  [
    { speaker: 'musk', text: "[laughs] Fair. But who is this really for? Give me one real person who needs it today.", mood: 'curious', stance: 'challenge', replyTo: 'jobs' },
    { speaker: 'altman', text: 'And how does it get ten times bigger without ten times the people?', mood: 'curious', stance: 'question', replyTo: 'user' },
  ],
  [
    { speaker: 'buffett', text: "I like simple businesses. What stops someone copying you next spring?", mood: 'skeptical', stance: 'question', replyTo: 'user' },
  ],
];

export function createFakeBrain({ delayMs = 150 } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/personas') return send(200, PERSONAS);
    if (req.method === 'POST' && req.url === '/turn') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'bad json' }); }
        calls.push(body);
        if (!body.idea) return send(400, { error: 'idea is required' });
        const answers = (body.history ?? []).filter((h) => h.speaker === 'user').length;
        setTimeout(() => {
          if (body.endCall || answers >= 3) {
            return send(200, {
              turns: [{ speaker: 'jobs', text: 'That is a wrap. Keep the focus.', mood: 'supportive', stance: 'advice', replyTo: 'user' }],
              awaitingUser: false, done: true,
              summary: {
                verdict: 'A real problem with a crowded field: pick one sharp wedge and prove it with ten users.',
                perPersona: PERSONAS.map((p, i) => ({ speaker: p.id, take: `${p.name} sees promise if you narrow the first version and talk to customers this week.`, score: 6 + (i % 3) })),
                nextSteps: ['Interview ten target users this week', 'Write down the one thing you will say no to', 'Ship a one-page prototype'],
              },
            });
          }
          const turns = SCRIPT[Math.min(answers, SCRIPT.length - 1)];
          send(200, { turns, awaitingUser: true, done: false, summary: null });
        }, delayMs);
      });
      return;
    }
    send(404, { error: 'not found' });
  });
  return {
    server, calls,
    listen: (port = 0) => new Promise((r) => server.listen(port, '127.0.0.1', () => r(server.address().port))),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fb = createFakeBrain();
  fb.listen(Number(process.env.PORT ?? 8011)).then((p) => console.log(`fake brain on http://127.0.0.1:${p}`));
}
