# CLAUDE.md

Project context for AI coding tools working in this repo.

## What this is

A book → illustrations pipeline (Style → Characters → Portraits → Chapters →
Illustrations) against the Gemini API, following
`Book_illustration.ipynb` ("Illustrate a book: The Wind in the Willows").
Full requirements: the assessment brief this repo was built against (not
included here — see `docs/plan.md` for the parts that shaped the build).

## Stack

- `server/`: Node.js + TypeScript + Express, ES modules (`type: module`,
  `NodeNext` resolution — import local files with a `.js` extension even
  though the source is `.ts`).
- `web/`: React + Vite + TypeScript, React Router.
- Storage: JSON files on disk under `server/data/` (see
  `docs/architecture.md`). No database.
- Tests: Vitest on both sides; React Testing Library on the frontend.

## Commands

- `npm run dev` (root) — starts both dev servers via `concurrently`.
- `npm test` (root) — runs both test suites.
- `npm test -w server` / `npm test -w web` — one side at a time.
- `./start.sh` / `./start.ps1`, `./test.sh` / `./test.ps1` — the deliverable
  one-liners; they just wrap the above with a first-run `.env` copy.

## Invariants that must not regress

These map directly to graded requirements — changes touching the pipeline
should keep all of them true:

1. **2 characters / 1 chapter, enforced server-side.** `MAX_CHARACTERS` /
   `MAX_CHAPTERS` in `server/src/lib/types.ts`. Enforcement is in
   `gemini.ts` (slices the parsed response), not just the prompt text.
2. **Steps run in order.** `pipeline.ts#startStep` derives the current step
   from `project.status` and rejects any other step with `StepOrderError`.
3. **No duplicate Gemini calls.** The `runningJobs` `Set` in `pipeline.ts`
   is checked-and-set synchronously, before any `await`. Don't introduce an
   `await` between the `has()` check and the `add()` — that reopens the race
   this exists to close.
4. **Resumable, nothing stuck forever.** `stepState` (`IDLE|RUNNING|FAILED`)
   is separate from `status` on purpose — see `DECISIONS.md`. A step
   orphaned by a crash/restart shows as `stuck` (computed, not persisted)
   and is retryable with no manual intervention.
5. **Send the book once.** Only the Style step's Gemini call includes the
   full book text; everything after chains via `previous_interaction_id`.
6. **Never auto-retry a Gemini call.** Retries are user-triggered (re-POST
   the run endpoint) only — no retry loops inside `gemini.ts`/`pipeline.ts`.

## Conventions

- Comments explain *why*, not *what* — see the existing files for the bar.
- No abstractions for steps 6+/features not in scope. If it's tempting to
  build a generic "step registry" or plugin system for 5 fixed steps, don't.
- Backend tests mock `../gemini.js` (pipeline tests) or `global.fetch`
  (gemini.ts tests) — never hit the real API in a test run.
- Frontend tests mock `../../lib/api` — no real HTTP in component tests.
- Windows note: file-locking tests in `store.test.ts` exist because of a
  real `EPERM` race on `fs.rename` — see `DECISIONS.md` before "simplifying"
  `store.ts`'s per-key lock back out.
