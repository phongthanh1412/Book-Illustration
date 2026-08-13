import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { nanoid } from 'nanoid';
import {
  setDataDir,
  createProject,
  readProject,
  updateProject,
  listProjectsForUser,
  findOrCreateUser,
  getUser,
} from '../store.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `bi-store-test-${nanoid(8)}`);
  setDataDir(tmpDir);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe('users', () => {
  it('creates a user on first login and reuses it on the next', async () => {
    const first = await findOrCreateUser('Ada@Example.com', 'Ada');
    expect(first.email).toBe('ada@example.com');

    const second = await findOrCreateUser('ADA@example.com', 'Ada Lovelace');
    expect(second.email).toBe('ada@example.com');
    expect(second.name).toBe('Ada Lovelace');

    const fetched = await getUser('ada@example.com');
    expect(fetched?.name).toBe('Ada Lovelace');
  });
});

describe('projects', () => {
  it('round-trips a created project', async () => {
    const project = await createProject({
      userEmail: 'ada@example.com',
      title: 'The Wind in the Willows',
      bookText: 'Once upon a time...',
    });
    expect(project.status).toBe('CREATED');
    expect(project.stepState).toBe('IDLE');

    const reloaded = await readProject(project.id);
    expect(reloaded?.title).toBe('The Wind in the Willows');
  });

  it('lists only the requesting user\'s projects, newest first', async () => {
    const a = await createProject({ userEmail: 'ada@example.com', title: 'A', bookText: 'x' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createProject({ userEmail: 'ada@example.com', title: 'B', bookText: 'x' });
    await createProject({ userEmail: 'grace@example.com', title: 'C', bookText: 'x' });

    const list = await listProjectsForUser('ada@example.com');
    expect(list.map((p) => p.id)).toEqual([b.id, a.id]);
  });

  it('serializes concurrent updateProject calls instead of losing writes', async () => {
    const project = await createProject({ userEmail: 'ada@example.com', title: 'A', bookText: 'x' });

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        updateProject(project.id, (p) => ({ ...p, title: `${p.title}${i}` })),
      ),
    );

    const final = await readProject(project.id);
    // All 20 mutations applied on top of the previous one, in call order —
    // none clobbered by a lost update — rather than a subset winning a race.
    const expectedSuffix = Array.from({ length: 20 }, (_, i) => `${i}`).join('');
    expect(final?.title).toBe(`A${expectedSuffix}`);
  });
});
