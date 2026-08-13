# Testing

## Strategy

**Backend** (`server/`, Vitest): focused on the logic the spec grades most
heavily — step ordering, progress modeling, and retry/concurrency — not on
re-testing Express or Node's `fs`.

- `pipeline.test.ts`: step ordering enforcement (can't run a step out of
  order), the full happy path with the 2-character/1-chapter caps asserted,
  user-supplied style skipping the Gemini style call, the duplicate-call
  guard (two concurrent `startStep` calls → exactly one succeeds), the
  orphan/stuck-step detection and recovery path, and failure leaving a step
  retryable without touching completed steps. The Gemini client is mocked
  (`vi.mock('../gemini.js')`) — no real network calls, and the mock's
  resolve/reject timing is what makes the concurrency tests deterministic.
- `gemini.test.ts`: the REST client in isolation, with `global.fetch`
  mocked. Specifically checks that the 2/1 caps are enforced by truncating
  the parsed response even when the (mocked) API returns more than the cap
  — the thing the spec calls out as a hard requirement to check
  server-side, not just trust the prompt to produce.
- `store.test.ts`: user upsert-by-email, project isolation per user, and
  that concurrent `updateProject` calls serialize instead of losing writes
  (the concurrency guarantee storage is supposed to provide at this scope).

**Frontend** (`web/`, Vitest + React Testing Library): a handful of
components/states that matter, not exhaustive coverage, per the spec's own
steer ("pick a couple that matter; don't test everything").

- `Stepper.test.tsx`: done/current/pending rendering across a few
  representative statuses — the piece of UI every screenshot in the spec
  leans on being correct.
- `EntityCard.test.tsx`: the three states a portrait/illustration card can
  be in (pending / generating / done) — this is the "per-item progress
  while images generate" requirement made visible.
- `ProjectListPage.test.tsx`: empty state with its call-to-action, status
  pills (including the "interrupted, needs retry" case), and the
  load-failure-with-retry state.
- `ProjectDetailPage.test.tsx`: the in-progress state naming the specific
  running step (not a bare spinner), the failed state with a same-step
  retry button, the stuck/orphaned-step recovery banner, and the initial
  loading state. These four map directly to the spec's required screens.

`api.ts` is mocked in every page test (`vi.mock('../../lib/api')`) — no real
HTTP in a component test.

## Deliberately not tested

- **E2E** — explicitly not expected per the spec.
- **Real Gemini calls** — every test mocks the client/`fetch`; nothing here
  burns quota, and nothing here can tell you the actual REST shape is
  correct against a live key (see `DECISIONS.md` for why that mapping was
  done carefully from the notebook/docs instead, but it's still unverified
  against a real key as of this writing).
- **The Express routes layer directly** (supertest against `index.ts`) —
  the pipeline logic underneath is tested, and the routes are thin
  pass-throughs to it, but a routes-level integration test would catch a
  wiring mistake the unit tests can't see. Named in `DECISIONS.md` as the
  first thing to add with more time.
- **Visual/CSS regressions** — judged by eye against `app-demo.html`, not
  automated.

## Test report (real run)

Produced by `./test.sh` (root `npm test`, which runs `npm test -w server`
then `npm test -w web`):

```
> book-illustrator-server@0.1.0 test
> vitest run

 ✓ src/lib/__tests__/gemini.test.ts (4 tests) 17ms
 ✓ src/lib/__tests__/store.test.ts (4 tests) 119ms
 ✓ src/lib/__tests__/pipeline.test.ts (7 tests) 383ms

 Test Files  3 passed (3)
      Tests  15 passed (15)
   Start at  10:59:14
   Duration  1.05s

> book-illustrator-web@0.1.0 test
> vitest run

 ✓ src/components/__tests__/EntityCard.test.tsx (3 tests) 90ms
 ✓ src/components/__tests__/Stepper.test.tsx (3 tests) 105ms
 ✓ src/pages/__tests__/ProjectListPage.test.tsx (3 tests) 198ms
 ✓ src/pages/__tests__/ProjectDetailPage.test.tsx (4 tests) 195ms

 Test Files  4 passed (4)
      Tests  13 passed (13)
   Start at  10:59:16
   Duration  2.14s
```

28/28 passing (15 backend, 13 frontend). The backend suite was run 12
consecutive times before this to confirm a Windows-specific race
(`EPERM` on concurrent file rename, see `DECISIONS.md`) was actually fixed
rather than coincidentally not reproducing — flagging that here since a
single green run wouldn't have caught it either.
