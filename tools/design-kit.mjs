#!/usr/bin/env node
// design-kit: a small CLI that stands in for design MCP servers we could not use at the event.
//
// Why a CLI: of the design sources the team picked, only some have usable integrations here.
//   * GSAP (gsap.com): an npm library, no MCP needed. This CLI vendors it into Part C.
//   * Taste Skill (tasteskill.dev): open source SKILL.md design rules (MIT). Copied to design/taste-skill.md.
//   * 21st.dev: has an MCP and CLI, but needs an account key and the free tier allows 2 installs a day.
//   * ThreeUI (threeui.com): MCP is Pro only (paid).
//   * CreatorFlow (creatorflow.so): Instagram DM automation, not a design tool.
// Part C's Content Security Policy only allows scripts from 'self', so libraries must be served locally.
//
// Usage (from the repo root):
//   node tools/design-kit.mjs vendor     copy GSAP from part-c-experience/node_modules into public/vendor
//   node tools/design-kit.mjs taste      print the Taste Skill rules the UI follows
//   node tools/design-kit.mjs doctor     check that the three services answer locally
//   node tools/design-kit.mjs sources    list the design sources and their status

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const partC = path.join(root, "part-c-experience");

const SOURCES = [
  { name: "GSAP", url: "https://gsap.com", status: "used", how: "npm gsap, vendored to part-c-experience/public/vendor" },
  { name: "Taste Skill", url: "https://www.tasteskill.dev", status: "used", how: "design/taste-skill.md (MIT), rules followed by the UI" },
  { name: "21st.dev", url: "https://21st.dev", status: "not used", how: "MCP needs an API key, free tier is 2 installs a day" },
  { name: "ThreeUI", url: "https://threeui.com", status: "not used", how: "MCP is Pro only" },
  { name: "CreatorFlow", url: "https://creatorflow.so", status: "not relevant", how: "Instagram DM automation, not a design tool" },
];

function vendor() {
  const out = path.join(partC, "public", "vendor");
  fs.mkdirSync(out, { recursive: true });
  const files = [["gsap/dist/gsap.min.js", "gsap.min.js"]];
  for (const [from, to] of files) {
    const src = path.join(partC, "node_modules", from);
    if (!fs.existsSync(src)) {
      console.error(`Missing ${from}. Run: cd part-c-experience && npm install`);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(out, to));
    console.log(`vendored ${to}`);
  }
}

function taste() {
  const file = path.join(root, "design", "taste-skill.md");
  process.stdout.write(fs.readFileSync(file, "utf8"));
}

async function doctor() {
  const checks = [
    ["Brain (Part B)", process.env.BRAIN_HEALTH || "http://localhost:8001/health"],
    ["Voice Studio (Part A)", process.env.VOICE_HEALTH || "http://localhost:8787/api/voices"],
    ["Hub + UI (Part C)", process.env.HUB_HEALTH || "http://localhost:3000/healthz"],
  ];
  let ok = true;
  for (const [name, url] of checks) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      console.log(`${res.ok ? "OK  " : "FAIL"} ${name}  ${url}  (${res.status})`);
      ok = ok && res.ok;
    } catch (err) {
      console.log(`FAIL ${name}  ${url}  (${err.message})`);
      ok = false;
    }
  }
  process.exit(ok ? 0 : 1);
}

function sources() {
  for (const s of SOURCES) console.log(`${s.status.padEnd(13)} ${s.name.padEnd(12)} ${s.url}  ${s.how}`);
}

const cmd = process.argv[2];
if (cmd === "vendor") vendor();
else if (cmd === "taste") taste();
else if (cmd === "doctor") await doctor();
else if (cmd === "sources") sources();
else {
  console.log("Usage: node tools/design-kit.mjs <vendor|taste|doctor|sources>");
  process.exit(cmd ? 1 : 0);
}
