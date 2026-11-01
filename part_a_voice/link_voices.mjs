// Links voices you saved in the ElevenLabs website to voices.json, matching by voiceName.
// Use this when you designed a voice in the browser instead of with design_voices.mjs.
//
//   ELEVENLABS_API_KEY=xxx node link_voices.mjs
//
// It lists your voices, finds the ones named in voices.json (for example "Council Perfectionist"),
// and writes their voice ids back into voices.json. No credits are spent.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const voicesPath = path.join(here, "voices.json");
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("Set ELEVENLABS_API_KEY first.");
  process.exit(1);
}

const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": API_KEY } });
if (!res.ok) {
  console.error(`ElevenLabs ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const { voices: mine } = await res.json();
const voices = JSON.parse(fs.readFileSync(voicesPath, "utf8"));

for (const [mindId, mind] of Object.entries(voices.minds)) {
  const hit = mine.find((v) => v.name === mind.voiceName);
  if (hit) {
    mind.voiceId = hit.voice_id;
    console.log(`${mindId}: linked ${mind.voiceName} (${hit.voice_id})`);
  } else {
    console.log(`${mindId}: no voice named "${mind.voiceName}" yet`);
  }
}
fs.writeFileSync(voicesPath, JSON.stringify(voices, null, 2) + "\n");
