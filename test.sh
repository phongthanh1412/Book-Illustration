#!/usr/bin/env bash
# One command to run every test (backend + frontend).
set -e
cd "$(dirname "$0")"
npm install
npm test
