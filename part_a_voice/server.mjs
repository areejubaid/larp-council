// Voice Studio server (Part A). No dependencies. Node 18+.
// Keeps the ElevenLabs key on the server, caches every line as audio on disk.
//
// Run:
//   ELEVENLABS_API_KEY=xxx node server.mjs          real voices
//   MOCK_TTS=1 node server.mjs                      fake tones, no key needed
//
// Endpoints:
//   GET  /                         demo.html
//   GET  /player.js                browser module
//   GET  /api/voices               voices.json (without descriptions)
//   POST /api/tts                  body: DebateLine JSON, returns { url, cached, mock }
//   GET  /cache/<file>             cached audio
//   GET  /mocks/<file>.json        mock scripts

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(here, "cache");
const PORT = Number(process.env.PORT || 8787);
const MOCK = process.env.MOCK_TTS === "1";
const API_KEY = process.env.ELEVENLABS_API_KEY || "";

fs.mkdirSync(CACHE_DIR, { recursive: true });

const voices = JSON.parse(fs.readFileSync(path.join(here, "voices.json"), "utf8"));

function cacheKey(mindId, text, model) {
  return crypto.createHash("sha1").update(`${model}|${mindId}|${text}`).digest("hex").slice(0, 20);
}

// Tiny WAV tone generator so the whole pipeline can be tested with no network.
function makeMockWav(text, hz) {
  const sampleRate = 22050;
  const seconds = Math.min(6, Math.max(1.2, text.length / 14));
  const n = Math.floor(sampleRate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const wobble = 1 + 0.15 * Math.sin(2 * Math.PI * 5 * t);
    const env = Math.min(1, t * 20, (seconds - t) * 20);
    const s = Math.sin(2 * Math.PI * hz * wobble * t) * 0.25 * env;
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// ElevenLabs limits how many requests can run at once (2 on the free plan, more on paid plans).
// The player asks for every line of a debate at the same time, so we queue here and retry on 429.
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);
let running = 0;
const waiting = [];
function acquire() {
  return new Promise((resolve) => {
    if (running < MAX_CONCURRENT) {
      running += 1;
      resolve();
    } else waiting.push(resolve);
  });
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

async function callElevenLabs(voiceId, text, model) {
  await acquire();
  try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      let res;
      try {
        res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ text, model_id: model }),
            signal: AbortSignal.timeout(12000), // never let one stuck request freeze the call
          }
        );
      } catch (err) {
        if (attempt < 4) {
          console.warn(`ElevenLabs network error (${err.name}), retry ${attempt}`);
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        throw err;
      }
      if (res.ok) return res;
      const body = await res.text();
      if (res.status === 429 && attempt < 4) {
        console.warn(`ElevenLabs busy (429), retry ${attempt}`);
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
    }
  } finally {
    release();
  }
}

async function synthesize(line) {
  const mind = voices.minds[line.mindId];
  if (!mind) throw new Error(`Unknown mindId: ${line.mindId}`);
  const model = voices.model;
  const key = cacheKey(line.mindId, line.text, MOCK ? "mock" : model);
  const ext = MOCK ? "wav" : "mp3";
  const file = `${key}.${ext}`;
  const full = path.join(CACHE_DIR, file);
  if (fs.existsSync(full)) return { url: `/cache/${file}`, cached: true, mock: MOCK };

  if (MOCK) {
    fs.writeFileSync(full, makeMockWav(line.text, mind.mockPitchHz || 200));
    return { url: `/cache/${file}`, cached: false, mock: true };
  }

  if (!API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!mind.voiceId) throw new Error(`No voiceId for ${line.mindId}. Run design_voices.mjs first.`);

  const res = await callElevenLabs(mind.voiceId, line.text, model);
  fs.writeFileSync(full, Buffer.from(await res.arrayBuffer()));
  return { url: `/cache/${file}`, cached: false, mock: false };
}

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
  res.end(body);
}

function serveStatic(res, rel) {
  const full = path.normalize(path.join(here, rel));
  if (!full.startsWith(here) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return send(res, 404, JSON.stringify({ error: "not found" }));
  }
  send(res, 200, fs.readFileSync(full), TYPES[path.extname(full)] || "application/octet-stream");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    return res.end();
  }
  try {
    if (req.method === "GET" && url.pathname === "/") return serveStatic(res, "demo.html");
    if (req.method === "GET" && url.pathname === "/player.js") return serveStatic(res, "player.js");
    if (req.method === "GET" && url.pathname.startsWith("/cache/")) return serveStatic(res, url.pathname);
    if (req.method === "GET" && url.pathname.startsWith("/mocks/")) return serveStatic(res, url.pathname);
    if (req.method === "GET" && url.pathname === "/api/voices") {
      const safe = Object.fromEntries(
        Object.entries(voices.minds).map(([id, m]) => [id, { label: m.label, ready: MOCK || !!m.voiceId }])
      );
      return send(res, 200, JSON.stringify({ mock: MOCK, minds: safe }));
    }
    if (req.method === "POST" && url.pathname === "/api/tts") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const line = JSON.parse(raw);
      if (!line.mindId || !line.text) return send(res, 400, JSON.stringify({ error: "mindId and text required" }));
      return send(res, 200, JSON.stringify(await synthesize(line)));
    }
    send(res, 404, JSON.stringify({ error: "not found" }));
  } catch (err) {
    console.error("TTS error:", String(err.message || err));
    send(res, 500, JSON.stringify({ error: String(err.message || err) }));
  }
});

server.listen(PORT, () => {
  console.log(`Voice Studio on http://localhost:${PORT}  mode=${MOCK ? "MOCK" : "LIVE"}`);
});
