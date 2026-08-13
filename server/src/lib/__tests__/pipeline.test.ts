import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { setDataDir, createProject, readProject, updateProject } from '../store.js';

vi.mock('../gemini.js', () => ({
  generateStyle: vi.fn(async () => ({ style: 'watercolour', interactionId: 'root-1' })),
  seedRootInteraction: vi.fn(async () => ({ interactionId: 'root-1' })),
  generateCharacters: vi.fn(async (_rootId: string, max: number) => ({
    characters: Array.from({ length: max }, (_, i) => ({ name: `Char ${i}`, prompt: `prompt ${i}` })),
    interactionId: 'chars-1',
  })),
  generatePortrait: vi.fn(async () => ({
    buffer: Buffer.from('fake-png'),
    mimeType: 'image/png',
    interactionId: 'portrait-1',
  })),
  generateChapters: vi.fn(async (_charsId: string, max: number) => ({
    chapters: Array.from({ length: max }, (_, i) => ({
      name: `Chapter ${i}`,
      prompt: `chapter prompt ${i}`,
      characters: ['Char 0'],
    })),
    interactionId: 'chapters-1',
  })),
  generateIllustration: vi.fn(async () => ({
    buffer: Buffer.from('fake-illustration'),
    mimeType: 'image/png',
    interactionId: 'illustration-1',
  })),
}));

// Imported after the mock so pipeline.ts picks up the mocked module.
const { startStep, isOrphanedRunning, StepOrderError, StepBusyError } = await import('../pipeline.js');

async function waitUntilIdleOrFailed(id: string, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const p = await readProject(id);
    if (p && p.stepState !== 'RUNNING') return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Timed out waiting for step to settle');
}

beforeEach(() => {
  setDataDir(path.join(os.tmpdir(), `bi-pipeline-test-${nanoid(8)}`));
  vi.clearAllMocks();
});

describe('step ordering', () => {
  it('refuses to run a step out of order', async () => {
    const project = await createProject({ userEmail: 'a@b.com', title: 'T', bookText: 'text' });
    await expect(startStep(project.id, 'CHARACTERS')).rejects.toBeInstanceOf(StepOrderError);
  });

  it('runs the happy path style -> characters -> portraits -> chapters -> illustrations', async () => {
    const project = await createProject({ userEmail: 'a@b.com', title: 'T', bookText: 'text' });

    await startStep(project.id, 'STYLE');
    let p = await waitUntilIdleOrFailed(project.id);
    expect(p.status).toBe('STYLE_SET');
    expect(p.style).toBe('watercolour');

    await startStep(project.id, 'CHARACTERS');
    p = await waitUntilIdleOrFailed(project.id);
    expect(p.status).toBe('CHARACTERS_GENERATED');
    expect(p.characters).toHaveLength(2); // hard cap, see types.ts MAX_CHARACTERS

    await startStep(project.id, 'PORTRAITS');
    p = await waitUntilIdleOrFailed(project.id);
    expect(p.status).toBe('PORTRAITS_GENERATED');
    expect(p.characters.every((c) => c.portraitStatus === 'done')).toBe(true);

    await startStep(project.id, 'CHAPTERS');
    p = await waitUntilIdleOrFailed(project.id);
    expect(p.status).toBe('CHAPTERS_GENERATED');
    expect(p.chapters).toHaveLength(1); // hard cap, see types.ts MAX_CHAPTERS

    await startStep(project.id, 'ILLUSTRATIONS');
    p = await waitUntilIdleOrFailed(project.id);
    expect(p.status).toBe('DONE');
    expect(p.chapters[0].illustrationStatus).toBe('done');
  });

  it('lets a user-supplied style skip the Gemini style call', async () => {
    const gemini = await import('../gemini.js');
    const project = await createProject({ userEmail: 'a@b.com', title: 'T', bookText: 'text' });

    await startStep(project.id, 'STYLE', { userStyle: 'gritty noir ink' });
    const p = await waitUntilIdleOrFailed(project.id);

    expect(p.style).toBe('gritty noir ink');
    expect(gemini.generateStyle).not.toHaveBeenCalled();
    expect(gemini.seedRootInteraction).toHaveBeenCalledOnce();
  });
});

describe('duplicate-call guard', () => {
  it('blocks a second concurrent run of the same step', async () => {
    const project = await createProject({ userEmail: 'a@b.com', title: 'T', bookText: 'text' });

    const results = await Promise.allSettled([
      startStep(project.id, 'STYLE'),
      startStep(project.id, 'STYLE'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(StepBusyError);

    await waitUntilIdleOrFailed(project.id);
  });

  it('does NOT block once the previous step has actually finished', async () => {
    const project = await createProject({ userEmail: 'a@b.com', title: 'T', bookText: 'text' });
    await startStep(project.id, 'STYLE');
    await waitUntilIdleOrFailed(project.id);

    await expect(startStep(project.id, 'CHARACTERS')).resolves.toBeTruthy();
    await waitUntilIdleOrFailed(project.id); // drain the background job before the next test swaps data dirs
  });
});

describe('orphan / stuck-step recovery', () => {
  it('flags a persisted RUNNING step with no in-memory job as stuck, and allows retrying it', async () => {
    const project = await createProject({ userEmail: 'a@b.com', title: 'T', bookText: 'text' });
    // Simulate a server crash mid-step: stepState says RUNNING on disk, but no
    // job is registered in this process's in-memory set.
    const stuckProject = await updateProject(project.id, (p) => ({
      ...p,
      stepState: 'RUNNING',
      stepStartedAt: new Date().toISOString(),
    }));

    expect(isOrphanedRunning(stuckProject)).toBe(true);

    // Retrying should succeed immediately — no manual DB surgery needed.
    await expect(startStep(project.id, 'STYLE')).resolves.toBeTruthy();
    const settled = await waitUntilIdleOrFailed(project.id);
    expect(settled.status).toBe('STYLE_SET');
  });
});

describe('failure and retry', () => {
  it('leaves a failed step retryable without touching completed steps', async () => {
    const gemini = await import('../gemini.js');
    vi.mocked(gemini.generateStyle).mockRejectedValueOnce(new Error('Gemini exploded'));

    const project = await createProject({ userEmail: 'a@b.com', title: 'T', bookText: 'text' });
    await startStep(project.id, 'STYLE');
    let p = await waitUntilIdleOrFailed(project.id);
    expect(p.stepState).toBe('FAILED');
    expect(p.lastError).toContain('Gemini exploded');
    expect(p.status).toBe('CREATED'); // never advanced past the failed step

    // Retry (same endpoint, same step) succeeds now that the mock resolves normally.
    await startStep(project.id, 'STYLE');
    p = await waitUntilIdleOrFailed(project.id);
    expect(p.stepState).toBe('IDLE');
    expect(p.status).toBe('STYLE_SET');
  });
});
