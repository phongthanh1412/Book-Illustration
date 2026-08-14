import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { setDataDir } from '../lib/store.js';
import type { StepKey } from '../lib/types.js';

// Same mock shape as pipeline.test.ts, but exercised through the real Express
// app instead of calling startStep() directly — the gap that file's tests
// leave: the routes layer stitching auth, ownership checks, and the pipeline
// together. See DECISIONS.md.
vi.mock('../lib/gemini.js', () => ({
  generateStyle: vi.fn(async () => ({ style: 'watercolour', interactionId: 'root-1' })),
  seedRootInteraction: vi.fn(async () => ({ interactionId: 'root-1' })),
  generateCharacters: vi.fn(async (_rootId: string, max: number) => ({
    characters: Array.from({ length: max }, (_, i) => ({ name: `Char ${i}`, prompt: `prompt ${i}` })),
    interactionId: 'chars-1',
  })),
  generatePortrait: vi.fn(async () => ({
    buffer: Buffer.from('fake-portrait'),
    mimeType: 'image/jpeg',
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
    mimeType: 'image/jpeg',
    interactionId: 'illustration-1',
  })),
}));

// Imported after the mock so app.ts (via pipeline.ts) picks up the mocked module.
const { app } = await import('../app.js');

async function waitUntilIdleOrFailed(agent: ReturnType<typeof request.agent>, projectId: string) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const res = await agent.get(`/api/projects/${projectId}`).expect(200);
    if (res.body.project.stepState !== 'RUNNING') return res.body.project;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Timed out waiting for step to settle');
}

async function runStepAndWait(agent: ReturnType<typeof request.agent>, projectId: string, step: StepKey) {
  await agent.post(`/api/projects/${projectId}/steps/${step}/run`).expect(202);
  return waitUntilIdleOrFailed(agent, projectId);
}

beforeEach(() => {
  setDataDir(path.join(os.tmpdir(), `bi-routes-test-${nanoid(8)}`));
  vi.clearAllMocks();
});

describe('full pipeline through the real HTTP routes', () => {
  it('runs style -> characters -> portraits -> chapters -> illustrations end to end', async () => {
    const agent = request.agent(app);

    await agent.post('/api/auth/login').send({ name: 'Ada', email: 'ada@example.com' }).expect(200);

    const createRes = await agent
      .post('/api/projects')
      .send({ title: 'Wind in the Willows', bookText: 'Once upon a time...' })
      .expect(201);
    const projectId = createRes.body.project.id;

    let project = await runStepAndWait(agent, projectId, 'STYLE');
    expect(project.status).toBe('STYLE_SET');
    expect(project.style).toBe('watercolour');

    project = await runStepAndWait(agent, projectId, 'CHARACTERS');
    expect(project.status).toBe('CHARACTERS_GENERATED');
    expect(project.characters).toHaveLength(2); // hard cap, see types.ts MAX_CHARACTERS

    project = await runStepAndWait(agent, projectId, 'PORTRAITS');
    expect(project.status).toBe('PORTRAITS_GENERATED');
    expect(project.characters.every((c: { portraitStatus: string }) => c.portraitStatus === 'done')).toBe(true);

    project = await runStepAndWait(agent, projectId, 'CHAPTERS');
    expect(project.status).toBe('CHAPTERS_GENERATED');
    expect(project.chapters).toHaveLength(1); // hard cap, see types.ts MAX_CHAPTERS

    project = await runStepAndWait(agent, projectId, 'ILLUSTRATIONS');
    expect(project.status).toBe('DONE');
    expect(project.chapters[0].illustrationStatus).toBe('done');

    // Images are only reachable through the files route (ownership-checked),
    // not served directly off disk.
    const image = await agent.get(`/api/files/${projectId}/portraits/0`).expect(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
  });

  it('blocks a same-step double-run over HTTP and rejects an unauthenticated request', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ name: 'Ada', email: 'ada2@example.com' }).expect(200);

    const createRes = await agent.post('/api/projects').send({ title: 'T', bookText: 'text' }).expect(201);
    const projectId = createRes.body.project.id;

    const [first, second] = await Promise.all([
      agent.post(`/api/projects/${projectId}/steps/STYLE/run`),
      agent.post(`/api/projects/${projectId}/steps/STYLE/run`),
    ]);
    expect([first.status, second.status].sort()).toEqual([202, 409]);
    await waitUntilIdleOrFailed(agent, projectId); // drain the accepted request's background job

    // No session cookie at all — a different concern than a second tab on
    // the same session, and one the pipeline-level tests can't see.
    await request(app).get(`/api/projects/${projectId}`).expect(401);
  });

  it("404s a project owned by a different user instead of leaking it", async () => {
    const owner = request.agent(app);
    await owner.post('/api/auth/login').send({ name: 'Owner', email: 'owner@example.com' }).expect(200);
    const createRes = await owner.post('/api/projects').send({ title: 'T', bookText: 'text' }).expect(201);
    const projectId = createRes.body.project.id;

    const intruder = request.agent(app);
    await intruder.post('/api/auth/login').send({ name: 'Intruder', email: 'intruder@example.com' }).expect(200);
    await intruder.get(`/api/projects/${projectId}`).expect(404);
  });
});
