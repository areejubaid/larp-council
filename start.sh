#!/usr/bin/env bash
# Starts all of LARP Council on one machine and opens it in the browser.
#
#   ./start.sh            real ElevenLabs voices if ELEVENLABS_API_KEY is set, otherwise mock tones
#   ./start.sh --cache    also caches every demo line first (spends credits once, then the demo is free and offline)
#
# Brain on 8001, Voice Studio on 8787, Hub and UI on 3000. Ctrl+C stops everything.
set -u
cd "$(dirname "$0")"
ROOT="$(pwd)"
# Keys can live in a .env file at the repo root (git-ignored), for example:
#   ELEVENLABS_API_KEY=...
#   FEATHERLESS_API_KEY=...
if [ -f .env ]; then set -a; . ./.env; set +a; fi
mkdir -p "$ROOT/.logs"

if [ -n "${ELEVENLABS_API_KEY:-}" ]; then
  echo "Voices: LIVE (ElevenLabs key found)"
  VOICE_ENV=""
else
  echo "Voices: MOCK tones (no ELEVENLABS_API_KEY in this terminal). For real voices run:"
  echo "  export ELEVENLABS_API_KEY=your_key   then   ./start.sh"
  VOICE_ENV="MOCK_TTS=1"
fi

PIDS=()
cleanup() {
  echo
  echo "Stopping LARP Council..."
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null; done
  exit 0
}
trap cleanup INT TERM

PY="$(command -v python3 || command -v python)"
(cd part-b-brain && PORT=8001 "$PY" server.py >"$ROOT/.logs/brain.log" 2>&1) &
PIDS+=($!)
(cd part_a_voice && env $VOICE_ENV PORT=8787 node server.mjs >"$ROOT/.logs/voice.log" 2>&1) &
PIDS+=($!)
if [ ! -d part-c-experience/node_modules ]; then
  echo "Installing UI packages (first run only)..."
  (cd part-c-experience && npm install --silent)
fi
(cd part-c-experience && BRAIN_URL=http://localhost:8001/run VOICE_URL=http://localhost:8787 PORT=3000 node server/index.js >"$ROOT/.logs/hub.log" 2>&1) &
PIDS+=($!)

echo "Waiting for the three services..."
for i in $(seq 1 30); do
  if node tools/design-kit.mjs doctor >/dev/null 2>&1; then break; fi
  sleep 1
done
node tools/design-kit.mjs doctor || { echo "Something did not start. Logs are in .logs/"; cleanup; }

if [ "${1:-}" = "--cache" ]; then
  echo "Caching every demo line (one time)..."
  (cd part_a_voice && BRAIN_URL=http://localhost:8001/run node prerender.mjs http://localhost:8787)
fi

echo
echo "LARP Council is running: http://localhost:3000"
[ "$(uname)" = "Darwin" ] && open "http://localhost:3000"
echo "Press Ctrl+C to stop. Logs: .logs/brain.log, .logs/voice.log, .logs/hub.log"
wait
