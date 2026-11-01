// Creates the council voices with ElevenLabs Voice Design (descriptors only, no real names, no cloning).
//
// Usage:
//   ELEVENLABS_API_KEY=xxx node design_voices.mjs            designs every mind that has no voiceId yet
//   ELEVENLABS_API_KEY=xxx node design_voices.mjs engineer   designs one mind
//   ELEVENLABS_API_KEY=xxx node design_voices.mjs engineer 2 saves preview number 2 (0 based) instead of 0
//
// For each mind it asks for previews, saves the chosen one as a permanent voice,
// and writes the voiceId back into voices.json. Previews are also saved to
// previews/<mind>_<n>.mp3 so the team can listen and pick.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const voicesPath = path.join(here, "voices.json");
const previewDir = path.join(here, "previews");
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("Set ELEVENLABS_API_KEY first.");
  process.exit(1);
}

const voices = JSON.parse(fs.readFileSync(voicesPath, "utf8"));
const only = process.argv[2];
const pick = Number(process.argv[3] || 0);
fs.mkdirSync(previewDir, { recursive: true });

const headers = { "xi-api-key": API_KEY, "Content-Type": "application/json" };

async function designOne(mindId, mind) {
  console.log(`Designing ${mindId}...`);
  const design = await fetch("https://api.elevenlabs.io/v1/text-to-voice/design", {
    method: "POST",
    headers,
    body: JSON.stringify({
      voice_description: mind.description,
      model_id: "eleven_ttv_v3",
      auto_generate_text: true,
    }),
  });
  if (!design.ok) throw new Error(`design ${design.status}: ${await design.text()}`);
  const { previews } = await design.json();

  previews.forEach((p, i) => {
    fs.writeFileSync(path.join(previewDir, `${mindId}_${i}.mp3`), Buffer.from(p.audio_base_64, "base64"));
  });
  console.log(`  saved ${previews.length} previews to previews/${mindId}_*.mp3`);

  const chosen = previews[Math.min(pick, previews.length - 1)];
  const create = await fetch("https://api.elevenlabs.io/v1/text-to-voice", {
    method: "POST",
    headers,
    body: JSON.stringify({
      voice_name: mind.voiceName,
      voice_description: mind.description,
      generated_voice_id: chosen.generated_voice_id,
    }),
  });
  if (!create.ok) throw new Error(`create ${create.status}: ${await create.text()}`);
  const { voice_id } = await create.json();
  mind.voiceId = voice_id;
  console.log(`  saved voice ${voice_id}`);
}

for (const [mindId, mind] of Object.entries(voices.minds)) {
  if (only && only !== mindId) continue;
  if (!only && mind.voiceId) {
    console.log(`Skipping ${mindId}, already has a voiceId.`);
    continue;
  }
  await designOne(mindId, mind);
  fs.writeFileSync(voicesPath, JSON.stringify(voices, null, 2) + "\n");
}
console.log("Done. voices.json updated.");
