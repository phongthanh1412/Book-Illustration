# Decisions

A note on how this file came to be, since it matters for how to read it:
this build was driven end-to-end by Claude (Claude Code) in a single working
session with the person submitting it, rather than a human writing code with
AI suggestions alongside. The stack/storage choice below was a genuine
back-and-forth (recorded as it happened, via an actual multiple-choice
decision point, not reconstructed afterward). The three "override" entries
are real: each was Claude's own first draft being wrong in a way the test
suite (or, for two of them, a live run against a real key) caught, not a
human catching Claude — which is a narrower kind of "pushback" than the spec
is really probing for. Anyone reviewing this before submitting it should
treat it as a strong draft, not a finished answer: read the code, run the
suite yourself, and be ready to explain (or challenge) every decision below
in your own words.

A real `GEMINI_API_KEY` was added and exercised after the initial build (see
the last two entries) — Style and Characters were confirmed working
end-to-end against live Gemini calls with real generated content. Portraits
and Illustrations are blocked on this key by a `429`/`limit: 0` quota for
every image model tried (`gemini-3.1-flash-lite-image`,
`gemini-2.5-flash-image`) — an account/billing condition on the key used to
test, not a code issue; see the entry below and `docs/architecture.md`.

**At a glance** — 3 design decisions, 5 AI overrides (≥3 required by §2.3),
plus the quota writeup and the one-more-day answer:

- [Stack and storage: Node/TS/Express + React/Vite + JSON files](#stack-and-storage-nodetypescriptexpress--reactvite--json-files)
- [Two fields for pipeline progress, not one](#two-fields-for-pipeline-progress-not-one)
- [Duplicate-call guard: an in-memory set, not a timeout](#duplicate-call-guard-an-in-memory-set-not-a-stale-after-n-seconds-timeout)
- [AI override #1 — Windows file-rename race](#ai-override-1-the-windows-file-rename-race-the-test-suite-caught)
- [AI override #2 — config error mislabeled as API error](#ai-override-2-a-config-error-being-silently-mislabeled-as-an-api-error)
- [AI override #3 — user style still costs a Gemini call](#ai-override-3-a-manual-end-to-end-smoke-test-surfaced-an-unstated-cost)
- [AI override #4 — fabricated `output_text` field](#ai-override-4-a-fabricated-response-field-caught-the-moment-a-real-key-was-added)
- [AI override #5 — wrong image mime type](#ai-override-5-an-image-encoding-assumption-a-live-400-corrected-in-one-shot)
- [Proof the pipeline is correct despite the image-model quota block](#proof-the-pipeline-is-correct-despite-the-image-model-quota-block)
- [If there were one more day](#if-there-were-one-more-day)

## Proof the pipeline is correct despite the image-model quota block

The `429`/`limit: 0` on every image model (see above) blocks Portraits and
Illustrations end-to-end, but it's a billing/quota condition on the key
used to test — not something the pipeline logic can be blamed for. Two
independent pieces of evidence separate "the code is wrong" from "the key
has no image quota":

1. **Pipeline logic, proven without touching the network.**
   `server/src/lib/__tests__/pipeline.test.ts` mocks every function in
   `gemini.ts` (real book text and Gemini API key not required) and drives
   `startStep()` — the actual function the HTTP route calls — through all
   five steps for real:

   ```bash
   npm test -w server -- pipeline.test.ts
   ```

   The `happy path style -> characters -> portraits -> chapters ->
   illustrations` test (lines 58-85) asserts `status` lands on
   `PORTRAITS_GENERATED`, `CHAPTERS_GENERATED`, then `DONE`, that the
   character/chapter caps hold (`toHaveLength(2)` / `toHaveLength(1)`), and
   that every portrait/illustration status flips to `done` — using a fake
   `Buffer.from('fake-png')` in place of a real image. The other six tests
   in the same file cover the duplicate-call guard, step-order enforcement,
   and orphan/stuck-step retry. All seven pass with no `GEMINI_API_KEY` set
   and no network access:

   ```
   ✓ src/lib/__tests__/pipeline.test.ts (7 tests) 368ms
     Test Files  1 passed (1)
     Tests       7 passed (7)
   ```

2. **Live proof for the two steps quota didn't block.** Style and
   Characters ran end-to-end against the real key with real generated
   content (style text, two named characters) before Portraits hit the
   `429`. That rules out the request/response parsing being the problem for
   those two calls — the same `postInteraction`/`extractText` path
   Portraits and Illustrations also use.

**Billing was attempted and couldn't be resolved before submission.** Fixing
the `429` requires attaching real billing to the key's Cloud project;
Google's billing setup rejected every virtual/prepaid card tried, and no
physical card was available in time. Routing around it via Imagen was
considered and rejected — it's being shut down by Google on 2026-08-17 and
isn't the Nano Banana-family model the spec (§5.3) calls for. Left as an
accepted gap: verified correct by the mocked test above, not by a real
generated image.

Screenshot evidence (Portraits stuck on the real quota error, as seen in
the running app):

![Portraits step blocked by image-model quota](screenshots/pipeline_test.png)

<!-- Add more screenshots above/below this line as needed, e.g. the
     Style/Characters steps completed live, or the `npm test` output. -->

## Stack and storage: Node/TypeScript/Express + React/Vite + JSON files

Presented as a real choice, not decided by default: Node/TS/Express vs.
Python/FastAPI for the backend (Python being what the reference notebook
itself uses), React/Vite vs. Vue vs. vanilla JS for the frontend, and JSON
files vs. SQLite for storage. The person building this picked
Node/TS/Express + React/Vite/TS + JSON files — one language across the whole
stack, "boring and familiar" per the spec's own steer, and REST-only access
to Gemini (no SDK) makes the Python-vs-Node question moot for the API layer
specifically.

Cost accepted: JSON files mean no transactions and no schema enforcement
beyond what TypeScript checks at compile time — a corrupt hand-edit to
`project.json` would not be caught the way a DB constraint would. Mitigated,
not eliminated, by atomic writes (write-then-rename) and a per-project lock
serializing every read and write to a given file (see the EPERM entry
below) — good enough at "one project's data, one project's disk footprint"
scale, not something to carry forward if this grew to multiple concurrent
users writing the same project.

## Two fields for pipeline progress, not one

`status` (`CREATED` → ... → `DONE`) tracks which steps have **completed**;
`stepState` (`IDLE | RUNNING | FAILED`) tracks what the **current** step is
doing right now. This was designed in up front, not arrived at after trying
a single enum, because the resumability requirement makes the gap concrete
immediately: "step 3 done, step 4 currently running" and "step 3 done, step
4 failed and needs a retry button" are both real states a page refresh has
to reconstruct correctly, and neither is expressible as one value without
overloading it (a single `CHARACTERS_GENERATING` value, say, can't also
carry "...and it failed" without a second field anyway).

Cost accepted: two fields that must be kept consistent by hand (a step
finishing has to both flip `stepState` back to `IDLE` and advance `status`
in the same write) rather than one column a state library could validate
transitions on. At five fixed steps this is small enough to keep as plain
object spreads in `pipeline.ts`; it would be the first thing to reconsider
if the step count became dynamic.

## Duplicate-call guard: an in-memory set, not a stale-after-N-seconds timeout

`app-demo.html`'s stand-in for this (`isStale`, an 8-second threshold) is
exactly the kind of number the spec says not to port, and for good reason:
a real Gemini call legitimately runs 10-30s+, so any fixed timeout is either
too short (flags a genuinely in-flight call as stuck) or too long (a real
crash sits unrecoverable until it elapses). The mechanism built instead:
`pipeline.ts` keeps an in-memory `Set` of project ids with a step actually
executing in *this* process, checked and added to **synchronously** (no
`await` in between) so two near-simultaneous requests for the same project
can never both pass the gate. A step is "stuck" precisely when
`stepState` on disk says `RUNNING` but this process's set doesn't have it —
which is exactly the server-crash-mid-call case, detected instantly on the
next request rather than after a guessed timeout, and with no risk of
false-flagging a call that's simply taking a while.

Cost accepted: this guarantee is per-process. If this ever ran as more than
one Node process (a second replica, a restart with the old process not
fully torn down), two processes could each believe they're the only one
running a step. Fine at "one server process" scale; would need a
cross-process lock (e.g. a lock row in a real DB, or a file lock) the moment
it wasn't.

## AI override #1: the Windows file-rename race the test suite caught

First implementation of atomic writes (`store.ts`) did the standard
write-to-temp-then-rename, with plain unlocked reads elsewhere for anything
that didn't need to mutate state. Backend tests were flaky — about 1 run in
3-4 — with `EPERM: operation not permitted, rename ...`. Root cause: on
Windows, renaming a temp file onto a path that another handle has open for
read can be rejected outright, and a test that polls `readProject` in a
tight loop while a step's job is mid-write hits that window far more than
real usage would (2-second frontend polling vs. a 10ms test loop), but the
underlying race is real either way. Fix: route the plain `readProject`
through the *same* per-project lock `updateProject` already used, so a read
can never overlap a write to the same file at all — not a retry-and-hope
patch, removing the window entirely. Verified stable across 12 consecutive
full-suite runs afterward. Left the retry-with-backoff in `atomicWriteFile`
too, as a second line of defense against anything external (antivirus,
an editor) that might briefly hold the file open.

## AI override #2: a config error being silently mislabeled as an API error

`gemini.ts`'s error handling originally treated any thrown error inside the
request function as "the Gemini API call failed," including a missing
`GEMINI_API_KEY` — which is a config problem the person running this needs
to fix, not a transient API failure worth a generic message. A test written
specifically to check "missing key produces a clear, distinct error"
(`gemini.test.ts`) failed: it came back wrapped as the generic API error
instead. Fixed by checking for the config-error type before the generic
wrap. Small, but it's the difference between a user seeing "add
GEMINI_API_KEY to server/.env" and seeing "Gemini API call failed:
GEMINI_API_KEY is not set" misfiled under a banner that reads like a
transient failure worth retrying — retrying it changes nothing until the
key is actually added.

## AI override #3: a manual end-to-end smoke test surfaced an unstated cost

Running the actual API by hand (curl, no automated test) to sanity-check
the orphan/retry path: supplying a user's own art style still triggers one
Gemini call (`seedRootInteraction`), because later steps chain off an
interaction id, and that id has to come from somewhere if the book text is
only ever sent once. The initial mental model — "user-supplied style skips
Gemini entirely," matching how `app-demo.html`'s pure-client mock behaves —
doesn't hold once context-chaining is real. Decided to keep the call rather
than route around it (e.g. by inventing an interaction id, which the API
doesn't support), and documented the cost here instead of leaving it as a
silent surprise: even the "free" path costs one lightweight text call.

## AI override #4: a fabricated response field, caught the moment a real key was added

The whole first build was written against `output_text` — a convenience
field the fetched docs implied the REST response would have. The very first
real run (Style step, real key) came back with `style: ""`; the second
(Characters) came back with an empty array despite `status: "completed"` and
real usage tokens billed. Both had silently "succeeded" by the code's own
logic, because `res.output_text` was just `undefined` and every call site
defaulted around it (`?? ''`, `?? '[]']`) instead of erroring — the exact
kind of silent-empty-success a spec focused on real behavior should catch.
Turned on a temporary `DEBUG_GEMINI=1` raw-response dump to see the actual
shape: no `output_text` at all; the real text sits in
`steps[].content[].text` on a `model_output`-typed step, behind a `thought`
step carrying an opaque `signature` blob instead of content. Rewrote
extraction around that (`extractText`/`extractImage` in `gemini.ts`), added
a regression test asserting text comes from `steps`, and treated this as a
correctness bug, not a docs quirk to shrug off: **a step advancing its
status with empty content is exactly the kind of silent failure the spec's
resumability requirements are designed to prevent**, so the parsing bug was
also a spec-compliance bug.

## AI override #5: an image encoding assumption a live 400 corrected in one shot

Image steps were built requesting `response_format: { mime_type: 'image/png' }`,
copying the mime type used for storage without checking whether the
generation endpoint actually supports it. First live Portraits run returned
an immediate `400`: `"The value 'image/png' is not supported for
'response_format.mime_type'. Supported values: 'image/jpeg'."` — about as
unambiguous as an API error gets. Switched the request, storage path
extension, and served `Content-Type` all to `image/jpeg` in one pass rather
than special-casing just the request. Left in place, and worth calling out
on its own: once that was fixed, the *next* real error was a `429` with
`limit: 0` for the image model on this key's tier — a quota/billing
condition, not a code path, and the clearest sign yet that the spec's "check
the image model's free-tier limits before you start" warning wasn't
boilerplate.

## If there were one more day

Real-time step updates (SSE) instead of 2-second polling — listed as a
bonus in the spec, and the honest reason it's not here is time, not
difficulty; the polling approach already satisfies every resumability/
duplicate-call requirement, SSE would only remove the up-to-2-second lag in
per-item progress reveal.

(The routes-level integration test — mocked Gemini, driven through real HTTP
requests against the Express app rather than calling `startStep()` directly
— was originally the answer to this question, and named as such here. Added
it afterward: `server/src/__tests__/routes.test.ts`, split `app.ts` out of
`index.ts` so `supertest` has something to import without binding a port.)
