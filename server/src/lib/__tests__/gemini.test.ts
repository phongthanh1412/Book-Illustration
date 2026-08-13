import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.GEMINI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe('generateCharacters', () => {
  it('enforces the max-characters cap server-side even if Gemini returns more', async () => {
    const { generateCharacters } = await import('../gemini.js');
    global.fetch = vi.fn(async () =>
      jsonResponse({
        id: 'interaction-1',
        output_text: JSON.stringify([
          { name: 'A', prompt: 'a' },
          { name: 'B', prompt: 'b' },
          { name: 'C', prompt: 'c' },
          { name: 'D', prompt: 'd' },
        ]),
      }),
    ) as unknown as typeof fetch;

    const { characters } = await generateCharacters('root-1', 2);
    expect(characters).toHaveLength(2);
    expect(characters.map((c) => c.name)).toEqual(['A', 'B']);
  });
});

describe('generateChapters', () => {
  it('enforces the max-chapters cap server-side even if Gemini returns more', async () => {
    const { generateChapters } = await import('../gemini.js');
    global.fetch = vi.fn(async () =>
      jsonResponse({
        id: 'interaction-2',
        output_text: JSON.stringify([
          { name: 'Ch1', prompt: 'p1', characters: [] },
          { name: 'Ch2', prompt: 'p2', characters: [] },
        ]),
      }),
    ) as unknown as typeof fetch;

    const { chapters } = await generateChapters('chars-1', 1);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].name).toBe('Ch1');
  });
});

describe('config and error handling', () => {
  it('throws a clear config error when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const { generateStyle, GeminiConfigError } = await import('../gemini.js');
    await expect(generateStyle('book text')).rejects.toBeInstanceOf(GeminiConfigError);
  });

  it('wraps a non-OK HTTP response in GeminiApiError', async () => {
    const { generateStyle, GeminiApiError } = await import('../gemini.js');
    global.fetch = vi.fn(async () =>
      jsonResponse({ error: 'quota exceeded' }, false, 429),
    ) as unknown as typeof fetch;

    await expect(generateStyle('book text')).rejects.toBeInstanceOf(GeminiApiError);
  });
});
