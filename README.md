# Book Illustration Studio

Turns a book's text into character portraits and a chapter illustration using
the Gemini API, following the 5-step pipeline from Google's
[Book_illustration.ipynb](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/examples/Book_illustration.ipynb)
notebook (Style → Characters → Portraits → Chapters → Illustrations), capped
at **2 characters** and **1 chapter** (enforced server-side).

## Quick start

```bash
./start.sh      # macOS/Linux/Git Bash
# or
./start.ps1     # Windows PowerShell
```

This installs dependencies, copies `server/.env.example` to `server/.env` if
missing, and starts both the backend (`:4000`) and frontend (`:5173`). Open
**http://localhost:5173**.

Add your key to `server/.env` before running a real pipeline step:

```
GEMINI_API_KEY=your-key-here
```

Without a key the app still runs end-to-end — steps fail with a clear,
retryable error instead of a real Gemini call (useful for exercising every UI
state without burning quota; see `DECISIONS.md`).

## Run the tests

```bash
./test.sh       # macOS/Linux/Git Bash
# or
./test.ps1      # Windows PowerShell
```

Runs the backend (Vitest) and frontend (Vitest + React Testing Library)
suites. See `TESTING.md` for the strategy and a real run's output.

## Prerequisites

- Node.js 20+ and npm
- A [Gemini API key](https://aistudio.google.com/apikey) to exercise real
  pipeline steps (not required to start the app or run the tests)
- No Docker/database required — see `DECISIONS.md` for the storage choice

## Environment variables

See `server/.env.example` (and `web/.env.example`, only needed if you're not
using the default ports):

| Variable | Where | Required | Notes |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | `server/.env` | For real pipeline calls | Never commit it |
| `GEMINI_TEXT_MODEL` | `server/.env` | No | Defaults to `gemini-3.6-flash` |
| `GEMINI_IMAGE_MODEL` | `server/.env` | No | Defaults to `gemini-3.1-flash-lite-image` |
| `PORT` | `server/.env` | No | Defaults to `4000` |
| `WEB_ORIGIN` | `server/.env` | No | CORS/cookie origin, defaults to `http://localhost:5173` |
| `COOKIE_SECRET` | `server/.env` | No | Any string; signs the session cookie |
| `DATA_DIR` | `server/.env` | No | Where JSON/book text/images live, defaults to `server/data` |
| `VITE_API_URL` | `web/.env` | No | Defaults to `http://localhost:4000/api` |

## Architecture (short version)

- **Backend**: Node.js + TypeScript + Express. REST calls to Gemini's
  `v1beta/interactions` endpoint directly (no SDK — see `DECISIONS.md`).
  State lives in JSON files on disk, one folder per project, isolated per
  user, serialized through a per-project async lock. Generated images and the
  book's text also live on disk and are served through the backend's own
  `/api/files/*` route (no S3/CDN).
- **Frontend**: React + Vite + TypeScript, polling-based (no WebSocket/SSE —
  see `docs/architecture.md`). Visual design follows the Gradion design
  system tokens from `app-demo.html`.
- **Pipeline**: each step is user-triggered, runs as a background job on the
  server, and is guarded against duplicate execution by an in-memory
  "currently running" set scoped to the process — see `DECISIONS.md` for why
  that (not a timeout) is what makes retries after a crash safe.

Full write-up: `docs/architecture.md`. Planning notes from before any code was
written: `docs/plan.md`. AI-assisted decisions and where they were overridden:
`DECISIONS.md`.

## Project layout

```
server/   Express API, Gemini REST client, JSON storage, pipeline state machine
web/      React app (Vite)
docs/     architecture + planning notes
```
