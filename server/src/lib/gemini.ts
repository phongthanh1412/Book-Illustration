// Thin REST wrapper around the Gemini "interactions" API (v1beta), used
// instead of the google-genai SDK per the assessment's hint: the notebook's
// newest conversation API is only wrapped by the Python/JS SDKs so far, but
// its REST endpoint is fully documented — so on this Node/Express stack we
// hit it directly with fetch. Mechanics (model IDs, previous_interaction_id
// chaining, response_format shapes) were read off the reference notebook and
// the Gemini API docs, not guessed — see docs/architecture.md.
//
// This is a brand-new (2026) API surface, and the first draft of this file
// was written without a live key, guessing the response shape from docs —
// wrong in two concrete ways a live key caught (see DECISIONS.md): there is
// no top-level `output_text` (real text lives in steps[].content[].text),
// and image response_format only accepts mime_type 'image/jpeg', not 'png'.
// Set DEBUG_GEMINI=1 to dump each raw response to a temp file if something
// else here turns out to not match reality.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image';

const TEXT_TIMEOUT_MS = 60_000;
const IMAGE_TIMEOUT_MS = 120_000;

export class GeminiConfigError extends Error {}
export class GeminiApiError extends Error {}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY is not set. Add it to server/.env (see .env.example).',
    );
  }
  return key;
}

interface ImagePart {
  mimeType: string;
  base64: string;
}

interface InteractionResponse {
  id: string;
  steps?: Array<{
    type?: string; // 'thought' (reasoning, has `signature` instead of `content`) | 'model_output'
    content?: Array<{ type: string; text?: string; data?: string; mime_type?: string }>;
  }>;
}

async function postInteraction(body: Record<string, unknown>, timeoutMs: number): Promise<InteractionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/interactions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new GeminiApiError(`Gemini API ${res.status}: ${text.slice(0, 500)}`);
    }
    if (process.env.DEBUG_GEMINI) {
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const path = await import('node:path');
      const file = path.join(os.tmpdir(), `gemini-debug-${Date.now()}.json`);
      await fs.writeFile(file, text);
      console.log('[gemini raw response] wrote', file);
    }
    return JSON.parse(text) as InteractionResponse;
  } catch (err) {
    if (err instanceof GeminiApiError || err instanceof GeminiConfigError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new GeminiApiError(`Gemini API call timed out after ${timeoutMs}ms`);
    }
    throw new GeminiApiError(`Gemini API call failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function extractImage(res: InteractionResponse): { buffer: Buffer; mimeType: string } {
  for (const step of res.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type === 'image' && part.data) {
        return { buffer: Buffer.from(part.data, 'base64'), mimeType: part.mime_type || 'image/jpeg' };
      }
    }
  }
  throw new GeminiApiError('Gemini response contained no image part');
}

/**
 * There is no top-level `output_text` on the real interactions response —
 * text lives in `steps[].content[].text` for steps of type `model_output`
 * (a separate `thought` step, with a `signature` blob instead of `content`,
 * precedes it and is skipped). Concatenates every text part across every
 * model_output step, in case a response ever splits text across more than
 * one. Also strips a ```json fence if the model wraps its JSON in one.
 */
function extractText(res: InteractionResponse): string {
  const text = (res.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('');
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

const CHARACTER_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      prompt: { type: 'string' },
    },
    required: ['name', 'prompt'],
  },
};

const CHAPTER_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      prompt: { type: 'string' },
      characters: { type: 'array', items: { type: 'string' } },
    },
    required: ['name', 'prompt', 'characters'],
  },
};

/**
 * Step 1 (Style). Sends the book text exactly once — this interaction becomes
 * the root of the chain; every later text step references it via
 * previous_interaction_id instead of re-sending the book.
 */
export async function generateStyle(
  bookText: string,
): Promise<{ style: string; interactionId: string }> {
  const res = await postInteraction(
    {
      model: TEXT_MODEL,
      input: [
        {
          type: 'text',
          text:
            `Here is the full text of a book:\n\n${bookText}\n\n` +
            'Propose a single cohesive illustration art style for this book (e.g. medium, ' +
            'palette, linework, mood) in 2-4 sentences. Respond with the style description only.',
        },
      ],
    },
    TEXT_TIMEOUT_MS,
  );
  return { style: extractText(res), interactionId: res.id };
}

/** User supplied their own style — no Gemini call, but we still need a root
 * interaction so later steps can chain off it with the book text attached. */
export async function seedRootInteraction(
  bookText: string,
  userStyle: string,
): Promise<{ interactionId: string }> {
  const res = await postInteraction(
    {
      model: TEXT_MODEL,
      input: [
        {
          type: 'text',
          text:
            `Here is the full text of a book:\n\n${bookText}\n\n` +
            `The illustration art style to use for everything below is: "${userStyle}". ` +
            'Acknowledge in one short sentence.',
        },
      ],
    },
    TEXT_TIMEOUT_MS,
  );
  return { interactionId: res.id };
}

export async function generateCharacters(
  rootInteractionId: string,
  maxCharacters: number,
): Promise<{ characters: { name: string; prompt: string }[]; interactionId: string }> {
  const res = await postInteraction(
    {
      model: TEXT_MODEL,
      previous_interaction_id: rootInteractionId,
      input: [
        {
          type: 'text',
          text:
            `List the ${maxCharacters} main ADULT characters of this book only (no children, ` +
            'no animals unless they are the adult protagonists). For each, give a "name" and an ' +
            'image "prompt" describing their appearance for a portrait illustration, consistent ' +
            `with the style already established. Return at most ${maxCharacters} characters.`,
        },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: CHARACTER_SCHEMA,
      },
    },
    TEXT_TIMEOUT_MS,
  );
  const parsed = JSON.parse(extractText(res) || '[]') as { name: string; prompt: string }[];
  return { characters: parsed.slice(0, maxCharacters), interactionId: res.id };
}

export async function generatePortrait(
  character: { name: string; prompt: string },
  style: string,
  previousInteractionId: string | null,
): Promise<{ buffer: Buffer; mimeType: string; interactionId: string }> {
  const res = await postInteraction(
    {
      model: IMAGE_MODEL,
      ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
      input: [
        {
          type: 'text',
          text:
            `Create a portrait illustration of ${character.name}. ${character.prompt} ` +
            `Overall art style: ${style}`,
        },
      ],
      response_format: { type: 'image', mime_type: 'image/jpeg' },
    },
    IMAGE_TIMEOUT_MS,
  );
  const { buffer, mimeType } = extractImage(res);
  return { buffer, mimeType, interactionId: res.id };
}

export async function generateChapters(
  charactersInteractionId: string,
  maxChapters: number,
): Promise<{ chapters: { name: string; prompt: string; characters: string[] }[]; interactionId: string }> {
  const res = await postInteraction(
    {
      model: TEXT_MODEL,
      previous_interaction_id: charactersInteractionId,
      input: [
        {
          type: 'text',
          text:
            `Pick ${maxChapters} chapter(s) from the book and write a scene illustration prompt ` +
            'for each, referencing the characters above by name where they appear. Return at most ' +
            `${maxChapters} chapter(s).`,
        },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: CHAPTER_SCHEMA,
      },
    },
    TEXT_TIMEOUT_MS,
  );
  const parsed = JSON.parse(extractText(res) || '[]') as {
    name: string;
    prompt: string;
    characters: string[];
  }[];
  return { chapters: parsed.slice(0, maxChapters), interactionId: res.id };
}

export async function generateIllustration(
  chapter: { name: string; prompt: string },
  style: string,
  referencePortraits: ImagePart[],
): Promise<{ buffer: Buffer; mimeType: string; interactionId: string }> {
  const res = await postInteraction(
    {
      model: IMAGE_MODEL,
      input: [
        {
          type: 'text',
          text:
            `Create a scene illustration for the chapter "${chapter.name}". ${chapter.prompt} ` +
            `Overall art style: ${style}. Use the attached reference portraits so the characters ` +
            'match their established appearance exactly.',
        },
        ...referencePortraits.map((p) => ({ type: 'image', mime_type: p.mimeType, data: p.base64 })),
      ],
      response_format: { type: 'image', mime_type: 'image/jpeg' },
    },
    IMAGE_TIMEOUT_MS,
  );
  const { buffer, mimeType } = extractImage(res);
  return { buffer, mimeType, interactionId: res.id };
}
