// Warms the audio cache for every line the demo can play, so the demo works with no network
// and spends no credits during judging.
// Start the server first (live mode with your key), then run:
//   node prerender.mjs [baseUrl]
//
// It reads:
//   part_a_voice/mocks/*.json          DebateScripts (Part A test page)
//   part-c-experience/mocks/*.json     event replays (the UI's demo buttons)
//   part-b-brain/mocks/*_script.json   DebateScripts (the Brain's offline answers)
//   part-b-brain/DEMO_PITCHES.md       only when BRAIN_URL is set: each demo pitch is sent to the Brain
//                                      (for example BRAIN_URL=https://larp-council-brain.onrender.com/run)
//                                      and the lines it answers with are cached too
// Lines are sent one at a time, which suits the ElevenLabs free plan limit.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "http://localhost:8787";
const dirs = [
  path.join(here, "mocks"),
  path.join(here, "..", "part-c-experience", "mocks"),
  path.join(here, "..", "part-b-brain", "mocks"),
];

function linesFrom(data) {
  if (Array.isArray(data)) return data.filter((e) => e && e.type === "line_ready" && e.payload).map((e) => e.payload);
  if (data && Array.isArray(data.lines)) return data.lines;
  return [];
}

async function brainScripts() {
  const url = process.env.BRAIN_URL;
  const file = path.join(here, "..", "part-b-brain", "DEMO_PITCHES.md");
  if (!url || !fs.existsSync(file)) return [];
  const pitches = fs.readFileSync(file, "utf8").split("\n")
    .map((row) => row.split("|").map((c) => c.trim()))
    .filter((cells) => cells.length >= 4 && cells[1].startsWith("**"))
    .map((cells) => cells[2]);
  const out = [];
  for (const [i, pitchText] of pitches.entries()) {
    for (const mode of ["roast", "larp"]) {
      const body = { sessionId: `prerender${i}${mode}`, mode, pitchText };
      if (mode === "larp") body.chosenMindId = "perfectionist";
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.script) out.push([`brain:${mode}:${i}`, data.script]);
      } catch (err) {
        console.log(`Brain not reachable for pitch ${i}: ${err.message}`);
      }
    }
  }
  return out;
}

const seen = new Set();
let rendered = 0, cached = 0, failed = 0;
const sources = [];
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      sources.push([file, JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))]);
    } catch {
      /* skip unreadable files */
    }
  }
}
sources.push(...(await brainScripts()));
{
  for (const [file, data] of sources) {
    for (const line of linesFrom(data)) {
      if (!line.mindId || !line.text) continue;
      const key = `${line.mindId}|${line.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const res = await fetch(`${base}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mindId: line.mindId, text: line.text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        failed += 1;
        console.log(`FAILED ${file} ${line.lineId}: ${body.error || res.status}`);
      } else if (body.cached) cached += 1;
      else {
        rendered += 1;
        console.log(`rendered ${file} ${line.lineId}`);
      }
    }
  }
}
console.log(`Done. ${rendered} new, ${cached} already cached, ${failed} failed.`);
