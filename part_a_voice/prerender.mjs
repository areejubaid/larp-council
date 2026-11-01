// Warms the audio cache for every mock script so the demo works with no network.
// Start the server first (live mode with your key), then run:
//   node prerender.mjs [baseUrl]
// Commit nothing from cache/ unless you want the clips in git (they are small, it is fine for a hackathon).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "http://localhost:8787";
const mockDir = path.join(here, "mocks");

for (const file of fs.readdirSync(mockDir).filter((f) => f.endsWith(".json"))) {
  const script = JSON.parse(fs.readFileSync(path.join(mockDir, file), "utf8"));
  for (const line of script.lines) {
    const res = await fetch(`${base}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mindId: line.mindId, text: line.text }),
    });
    const body = await res.json();
    console.log(`${file} ${line.lineId} ${res.ok ? (body.cached ? "cached" : "rendered") : "FAILED " + body.error}`);
  }
}
