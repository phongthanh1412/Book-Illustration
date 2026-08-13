# Planning notes

Written before implementation, used to scope the build. See `DECISIONS.md`
for where reality (and a second opinion) changed the plan.

## Reading the spec

1. Read the notebook's REST/API surface before writing any app code (fetched
   the notebook + Gemini API docs rather than guessing model IDs or call
   shapes — see `docs/architecture.md` for what that turned up: the
   `v1beta/interactions` endpoint, `gemini-3.6-flash` / `gemini-3.1-flash-lite-image`,
   `previous_interaction_id` chaining).
2. Non-negotiables called out in the spec, kept visible throughout: 2
   characters / 1 chapter caps enforced **server-side**; book text sent to
   Gemini **once**; steps run in order, **resumable**, **no duplicate
   calls**, **retryable on failure**, **nothing stuck forever**.
3. `app-demo.html` is the floor for scope/screens, not the interaction model
   — its `localStorage` + `setTimeout` stand-ins for a backend, and its
   client-only duplicate-click guard and stale-timeout, don't transfer to a
   real client/server split with 10-30s+ real calls.

## Stack decision

Node.js/TypeScript/Express + React/Vite/TypeScript + JSON files on disk.
Reasoning and trade-offs accepted are in `DECISIONS.md`; the short version is
"boring and familiar, one language across the stack, right-sized for the
scope."

## Build order

1. Shared pipeline types (`StepKey`, `ProjectStatus`, caps) first — everything
   else (storage shape, routes, UI state machine) derives from these.
2. Storage layer (JSON files, atomic writes, per-project lock) before
   anything that depends on it, so the resume/no-duplicate-write guarantees
   are load-bearing from the start rather than retrofitted.
3. Gemini REST client as its own module, independent of the pipeline glue —
   testable in isolation with a mocked `fetch`, so the 2/1 cap enforcement
   and error wrapping have direct unit coverage without needing a real key.
4. Pipeline state machine (step ordering, duplicate-call guard, orphan
   detection) — the part of the spec with the most subtle correctness
   requirements, built and tested before wiring it to HTTP.
5. Routes, then the frontend screens against the real API (no mock server) —
   `app-demo.html` as the visual/scope reference, not copied wholesale (own
   React components, own state machine driven by real per-item server
   progress instead of a client-side `setTimeout` simulation).
6. Tests alongside each layer, not bolted on at the end — the Windows
   `EPERM` rename race (see `DECISIONS.md`) was caught this way, before it
   ever reached a running server.

## Deliberately out of scope

Everything in the notebook's spec §08/"out of scope" list (Veo, Lyria, TTS,
audiobook mixing) and anything not required to make the 5-step pipeline work
end-to-end for one user at a time — no queueing system, no multi-process
lock, no image CDN, no auth beyond the spec's "email + name." See
`DECISIONS.md`'s "one more day" answer for what's next if the scope grew.
