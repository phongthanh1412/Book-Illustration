#!/usr/bin/env bash
# One command to start the whole stack (backend on :4000, frontend on :5173).
set -e
cd "$(dirname "$0")"

if [ ! -f server/.env ]; then
  echo "server/.env not found — copying server/.env.example (add your GEMINI_API_KEY before running real pipeline steps)"
  cp server/.env.example server/.env
fi

npm install
npm run dev
