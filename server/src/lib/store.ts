import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { Project, User } from './types.js';

// Everything lives under DATA_DIR, isolated per user/project. A DB was optional
// per spec; JSON files fit this scope as long as writes are serialized per key
// (see withLock) and never truncate partial state.
//
// A mutable variable (not a frozen const) so tests can point it at a throwaway
// temp dir via setDataDir() — avoids ESM import-ordering games with env vars.
let dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');

export function getDataDir(): string {
  return dataDir;
}
export function setDataDir(dir: string): void {
  dataDir = dir;
}

function usersFile() {
  return path.join(dataDir, 'users.json');
}
function projectsDir() {
  return path.join(dataDir, 'projects');
}

function projectDir(id: string) {
  return path.join(projectsDir(), id);
}
export function projectJsonPath(id: string) {
  return path.join(projectDir(id), 'project.json');
}
export function bookTextPath(id: string) {
  return path.join(projectDir(id), 'book.txt');
}
export function portraitPath(id: string, index: number) {
  return path.join(projectDir(id), 'portraits', `${index}.png`);
}
export function chapterImagePath(id: string, index: number) {
  return path.join(projectDir(id), 'chapters', `${index}.png`);
}
/** Resolve a relative path stored on a Character/Chapter record (e.g. "portraits/0.png") to an absolute one. */
export function projectFilePath(id: string, relPath: string) {
  return path.join(projectDir(id), relPath);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

/** Write-then-rename so a crash mid-write never leaves a truncated/corrupt file.
 * On Windows, renaming onto an existing path can transiently fail with EPERM/
 * EBUSY if another handle (e.g. a concurrent unlocked read elsewhere in this
 * file) has it briefly open — retry a few times before giving up. */
async function atomicWriteFile(filePath: string, data: string | Buffer) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${nanoid(6)}.tmp`;
  await fs.writeFile(tmp, data);
  const RETRIES = 5;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      await fs.rename(tmp, filePath);
      return;
    } catch (err: any) {
      if (attempt === RETRIES || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        await fs.rm(tmp, { force: true }).catch(() => {});
        throw err;
      }
      await new Promise((r) => setTimeout(r, 15 * attempt));
    }
  }
}

// ---- per-key async mutex --------------------------------------------------
// Serializes reads-modify-writes on the same file within this process so two
// concurrent requests (e.g. a step finishing while another request reads the
// project) never interleave writes. Does not span multiple processes — see
// DECISIONS.md for why that's an accepted limitation at this scope.
const locks = new Map<string, Promise<unknown>>();
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

// ---- users -----------------------------------------------------------------
async function readUsers(): Promise<Record<string, User>> {
  try {
    const raw = await fs.readFile(usersFile(), 'utf-8');
    return JSON.parse(raw);
  } catch (err: any) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function findOrCreateUser(email: string, name: string): Promise<User> {
  const key = email.trim().toLowerCase();
  return withLock('users', async () => {
    const users = await readUsers();
    if (users[key]) {
      // Name may have changed since last visit; keep it fresh.
      users[key].name = name;
    } else {
      users[key] = { email: key, name, createdAt: new Date().toISOString() };
    }
    await atomicWriteFile(usersFile(), JSON.stringify(users, null, 2));
    return users[key];
  });
}

export async function getUser(email: string): Promise<User | null> {
  const users = await readUsers();
  return users[email.trim().toLowerCase()] ?? null;
}

// ---- projects ----------------------------------------------------------------
export async function createProject(params: {
  userEmail: string;
  title: string;
  bookText: string;
}): Promise<Project> {
  const id = nanoid(12);
  const project: Project = {
    id,
    userEmail: params.userEmail,
    title: params.title,
    createdAt: new Date().toISOString(),
    bookTextPath: bookTextPath(id),
    status: 'CREATED',
    stepState: 'IDLE',
    stepStartedAt: null,
    lastError: null,
    style: null,
    rootInteractionId: null,
    charactersInteractionId: null,
    chaptersInteractionId: null,
    characters: [],
    chapters: [],
  };
  await atomicWriteFile(bookTextPath(id), params.bookText);
  await atomicWriteFile(projectJsonPath(id), JSON.stringify(project, null, 2));
  return project;
}

async function readProjectRaw(id: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(projectJsonPath(id), 'utf-8');
    return JSON.parse(raw);
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Routed through the same per-project lock as updateProject. Not just for
// consistency: on Windows, renaming a temp file onto project.json while
// another handle has it open for read can throw EPERM. Serializing reads and
// writes on one key removes the race instead of papering over it with retries.
export async function readProject(id: string): Promise<Project | null> {
  return withLock(`project:${id}`, () => readProjectRaw(id));
}

export async function readBookText(id: string): Promise<string> {
  return fs.readFile(bookTextPath(id), 'utf-8');
}

/** Read-modify-write a project under its own lock; `mutator` may be async. */
export async function updateProject(
  id: string,
  mutator: (p: Project) => Project | Promise<Project>,
): Promise<Project> {
  return withLock(`project:${id}`, async () => {
    const current = await readProjectRaw(id);
    if (!current) throw new Error(`Project ${id} not found`);
    const next = await mutator(current);
    await atomicWriteFile(projectJsonPath(id), JSON.stringify(next, null, 2));
    return next;
  });
}

export async function listProjectsForUser(userEmail: string): Promise<Project[]> {
  const email = userEmail.trim().toLowerCase();
  let ids: string[];
  try {
    ids = await fs.readdir(projectsDir());
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const projects = await Promise.all(ids.map((id) => readProject(id)));
  return projects
    .filter((p): p is Project => !!p && p.userEmail === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveImage(filePath: string, buffer: Buffer): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await atomicWriteFile(filePath, buffer);
}

export async function readImage(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}
