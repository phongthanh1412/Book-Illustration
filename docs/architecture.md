# Architecture

## Pipeline mechanics (from the reference notebook)

The notebook (`Book_illustration.ipynb`, "Illustrate a book: The Wind in the
Willows", steps 1-5) uses `google-genai>=2.10.0`'s **interactions API** —
a newer conversation primitive than `generateContent`/chat sessions, built
for exactly this kind of multi-step, context-chained pipeline. Its REST
surface (used here, since we're not on Python/JS) is:

```
POST https://generativelanguage.googleapis.com/v1beta/interactions
x-goog-api-key: <GEMINI_API_KEY>
```

Request body shape:

```jsonc
{
  "model": "gemini-3.6-flash",          // or the image model for gen steps
  "input": [{ "type": "text", "text": "..." }],
  "previous_interaction_id": "...",      // chains context without resending it
  "response_format": {                   // structured JSON or image output
    "type": "text",
    "mime_type": "application/json",
    "schema": { "type": "array", "items": { ... } }
  }
}
```

Response is an `Interaction` object: `{ id, status, usage, steps: [...] }`.
There is **no top-level `output_text`** — confirmed against a live key after
an earlier draft assumed one (see DECISIONS.md). `steps` holds a `thought`
entry (reasoning, carries a `signature` blob instead of `content`) followed
by a `model_output` entry whose `content` array is where the real payload
lives: `{ type: 'text', text: '...' }` for text/JSON responses, or
`{ type: 'image', data: '<base64>', mime_type: '...' }` for image responses.
`gemini.ts#extractText`/`#extractImage` pull from there.

Mapped onto the 5 steps (`server/src/lib/gemini.ts`):

| Step | Model | Call shape | Chains from |
| --- | --- | --- | --- |
| Style | text | book text sent once, style asked for or supplied by user | — (this becomes the chain root) |
| Characters | text | `response_format` JSON schema, max 2 | root interaction |
| Portraits | image | one call per character, each chained off the previous for style consistency | previous portrait's interaction |
| Chapters | text | `response_format` JSON schema, max 1 | characters interaction |
| Illustrations | image | chapter prompt + each referenced character's portrait bytes as image input parts | — (consistency via literal image inputs, not chaining) |

Image calls request `response_format: { type: 'image', mime_type: 'image/jpeg' }`
— confirmed live that `image/png` is rejected with a 400
(`"Supported values: 'image/jpeg'"`); generated images are stored and served
as `.jpg`. The image model itself needs a paid/billing-enabled tier — a free
key can return a `429` with `limit: 0` for every image model tried, which is
an account/quota condition, not a bug (see `DECISIONS.md`; the spec's own
hint that image limits are tighter than text held up in practice).

The book's text is sent **once**, in the Style step's call. Every step after
that references `previous_interaction_id` (or, for illustrations, the
portrait images themselves) instead of resending it — satisfying "send the
book once, reuse it across steps" without needing the Files API for what's
just plain UTF-8 text.

The 2-character / 1-chapter caps are requested in the prompt *and* enforced
by slicing the parsed array server-side (`gemini.ts`) regardless of what the
model returns — see `DECISIONS.md`.

## Pipeline state machine

Two fields track pipeline progress, not one — see `DECISIONS.md` for why:

- `status`: `CREATED → STYLE_SET → CHARACTERS_GENERATED → PORTRAITS_GENERATED → CHAPTERS_GENERATED → DONE`
  — which steps have **completed**.
- `stepState`: `IDLE | RUNNING | FAILED` — what the **current** step is doing
  right now.

`currentStep(status)` derives the step a project is sitting at from `status`
alone (`server/src/lib/types.ts`). A step can only be started
(`pipeline.ts#startStep`) if it matches that derived current step — so steps
can never run out of order, and a failed step never advances `status`, which
is what makes retry-without-touching-completed-steps free (nothing to undo).

### Duplicate-call guard (no timeout guessing)

`pipeline.ts` keeps an in-memory `Set<projectId>` of steps actually executing
in *this* process. `startStep` checks-and-adds to that set **synchronously**,
before any `await` — so two near-simultaneous requests for the same project
can never both pass the gate, regardless of how their later `await`s
interleave. A second tab or a double-click gets a 409 immediately.

If the server crashes or restarts mid-step, the persisted `stepState` still
says `RUNNING` — but the new process's in-memory set is empty. That
project's `stepState` is now **orphaned**: `isOrphanedRunning()` (computed at
response time, not persisted) reports it as `stuck` to the frontend, which
offers a retry. The retry succeeds immediately, because the fresh process's
gate has nothing recorded for that id. No stale-after-N-seconds heuristic,
no manual DB surgery.

Within a single process, a hung Gemini call still eventually frees the gate:
`gemini.ts` wraps every call in an `AbortController` timeout (60s text / 120s
image), so a job that never gets a response still settles (into `FAILED`)
well within what a user would wait for anyway.

## Storage

JSON files on disk, isolated per user/project (`server/src/lib/store.ts`):

```
server/data/
  users.json                       # email -> { name, createdAt }
  projects/<id>/
    project.json                   # status, stepState, style, characters, chapters, ...
    book.txt
    portraits/<index>.png
    chapters/<index>.png
```

- **Atomic writes**: write to a temp file, then rename over the target — a
  crash mid-write never leaves a truncated/corrupt JSON file.
- **Per-key async lock**: every read *and* write to a given `project.json`
  goes through the same in-process lock keyed by project id, so a step's
  incremental writes (one per character portrait, etc.) never interleave
  with a concurrent GET's read. This isn't just tidiness — on Windows,
  renaming a temp file onto a path that another handle has open for read can
  throw `EPERM`; serializing reads and writes removes the race outright
  instead of retrying around it (a real bug caught by the test suite —
  see `DECISIONS.md`).
- Images and book text are served through `/api/files/*`, which checks
  project ownership before reading from disk — no S3/CDN.

## Frontend

- Polling, not SSE/WebSocket: the detail page polls `GET /projects/:id`
  every 2s **only** while `stepState === 'RUNNING'` (and not `stuck`), and
  stops as soon as it isn't. Per-character/per-chapter progress is real
  server state (`portraitStatus`/`illustrationStatus` per item), not a
  client-side simulation — each poll can reveal one more portrait landing.
- Session: a signed httpOnly cookie holding the user's email — no
  password/OAuth, per spec. `AuthContext` resolves it once on load via
  `GET /api/auth/me`.
- Visual design: Gradion design system tokens carried over from
  `app-demo.html` (`web/src/styles/global.css`), with a few additions the
  static mock didn't need — a real error banner, a stuck-step banner, image
  skeleton shimmer.
