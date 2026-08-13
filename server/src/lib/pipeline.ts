import * as gemini from './gemini.js';
import {
  updateProject,
  readProject,
  readBookText,
  saveImage,
  readImage,
  portraitPath,
  chapterImagePath,
  projectFilePath,
} from './store.js';
import {
  currentStep,
  STATUS_AFTER_STEP,
  MAX_CHARACTERS,
  MAX_CHAPTERS,
  type Project,
  type StepKey,
} from './types.js';

export class StepOrderError extends Error {}
export class StepBusyError extends Error {}

// Project ids with a step genuinely executing in *this* process. This — not
// a timeout — is what tells a duplicate click/second tab (blocked) apart from
// a step orphaned by a server crash/restart (immediately retryable, since a
// fresh process starts with an empty set no matter what stepState says on
// disk). See DECISIONS.md for why this beats a stale-after-N-seconds guess.
const runningJobs = new Set<string>();

export function isOrphanedRunning(project: Project): boolean {
  return project.stepState === 'RUNNING' && !runningJobs.has(project.id);
}

export async function startStep(
  id: string,
  requestedStep: StepKey,
  opts: { userStyle?: string } = {},
): Promise<Project> {
  // Synchronous check-and-set: no `await` happens between the `has` check and
  // the `add`, so two near-simultaneous requests for the same project can
  // never both pass this gate, regardless of how their later `await`s interleave.
  if (runningJobs.has(id)) {
    throw new StepBusyError(`A step is already running for project ${id}`);
  }
  runningJobs.add(id);

  try {
    const existing = await readProject(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const step = currentStep(existing.status);
    if (step !== requestedStep) {
      throw new StepOrderError(`Project is at step ${step ?? 'DONE'}, cannot run ${requestedStep}`);
    }

    const started = await updateProject(id, (p) => ({
      ...p,
      stepState: 'RUNNING',
      stepStartedAt: new Date().toISOString(),
      lastError: null,
    }));

    // Fire-and-forget: HTTP layer responds with `started` right away; the
    // client polls GET /projects/:id to watch progress land.
    runStepJob(id, requestedStep, opts).finally(() => runningJobs.delete(id));

    return started;
  } catch (err) {
    runningJobs.delete(id);
    throw err;
  }
}

async function runStepJob(id: string, step: StepKey, opts: { userStyle?: string }) {
  try {
    switch (step) {
      case 'STYLE':
        await runStyleStep(id, opts.userStyle);
        break;
      case 'CHARACTERS':
        await runCharactersStep(id);
        break;
      case 'PORTRAITS':
        await runPortraitsStep(id);
        break;
      case 'CHAPTERS':
        await runChaptersStep(id);
        break;
      case 'ILLUSTRATIONS':
        await runIllustrationsStep(id);
        break;
    }
  } catch (err) {
    await updateProject(id, (p) => ({
      ...p,
      stepState: 'FAILED',
      lastError: (err as Error).message || 'Step failed',
    }));
  }
}

async function runStyleStep(id: string, userStyle?: string) {
  const bookText = await readBookText(id);
  const trimmed = userStyle?.trim();
  const { style, interactionId } = trimmed
    ? { style: trimmed, interactionId: (await gemini.seedRootInteraction(bookText, trimmed)).interactionId }
    : await gemini.generateStyle(bookText);

  await updateProject(id, (p) => ({
    ...p,
    style,
    rootInteractionId: interactionId,
    status: STATUS_AFTER_STEP.STYLE,
    stepState: 'IDLE',
    stepStartedAt: null,
  }));
}

async function runCharactersStep(id: string) {
  const project = await readProject(id);
  if (!project?.rootInteractionId) {
    throw new Error('Missing style interaction — run the Style step first');
  }
  const { characters, interactionId } = await gemini.generateCharacters(
    project.rootInteractionId,
    MAX_CHARACTERS,
  );
  await updateProject(id, (p) => ({
    ...p,
    characters: characters.map((c) => ({
      name: c.name,
      prompt: c.prompt,
      portraitStatus: 'pending' as const,
      portraitPath: null,
      imageInteractionId: null,
    })),
    charactersInteractionId: interactionId,
    status: STATUS_AFTER_STEP.CHARACTERS,
    stepState: 'IDLE',
    stepStartedAt: null,
  }));
}

async function runPortraitsStep(id: string) {
  const project = await readProject(id);
  if (!project) return;
  let previousInteractionId: string | null = null;

  for (let i = 0; i < project.characters.length; i++) {
    await updateProject(id, (p) => {
      const characters = [...p.characters];
      characters[i] = { ...characters[i], portraitStatus: 'generating' };
      return { ...p, characters };
    });

    const character = project.characters[i];
    const { buffer, interactionId } = await gemini.generatePortrait(
      { name: character.name, prompt: character.prompt },
      project.style ?? '',
      previousInteractionId,
    );
    previousInteractionId = interactionId;

    const relPath = `portraits/${i}.jpg`;
    await saveImage(portraitPath(id, i), buffer);
    await updateProject(id, (p) => {
      const characters = [...p.characters];
      characters[i] = {
        ...characters[i],
        portraitStatus: 'done',
        portraitPath: relPath,
        imageInteractionId: interactionId,
      };
      return { ...p, characters };
    });
  }

  await updateProject(id, (p) => ({
    ...p,
    status: STATUS_AFTER_STEP.PORTRAITS,
    stepState: 'IDLE',
    stepStartedAt: null,
  }));
}

async function runChaptersStep(id: string) {
  const project = await readProject(id);
  if (!project?.charactersInteractionId) {
    throw new Error('Missing characters interaction — run the Characters step first');
  }
  const { chapters, interactionId } = await gemini.generateChapters(
    project.charactersInteractionId,
    MAX_CHAPTERS,
  );
  await updateProject(id, (p) => ({
    ...p,
    chapters: chapters.map((c) => ({
      name: c.name,
      prompt: c.prompt,
      characterNames: c.characters,
      illustrationStatus: 'pending' as const,
      illustrationPath: null,
    })),
    chaptersInteractionId: interactionId,
    status: STATUS_AFTER_STEP.CHAPTERS,
    stepState: 'IDLE',
    stepStartedAt: null,
  }));
}

async function runIllustrationsStep(id: string) {
  const project = await readProject(id);
  if (!project) return;

  for (let i = 0; i < project.chapters.length; i++) {
    await updateProject(id, (p) => {
      const chapters = [...p.chapters];
      chapters[i] = { ...chapters[i], illustrationStatus: 'generating' };
      return { ...p, chapters };
    });

    const chapter = project.chapters[i];
    const doneCharacters = project.characters.filter((c) => c.portraitStatus === 'done' && c.portraitPath);
    let matched = doneCharacters.filter((c) => chapter.characterNames.includes(c.name));
    if (matched.length === 0) matched = doneCharacters; // fallback: still keep characters consistent

    const referencePortraits = await Promise.all(
      matched.map(async (c) => ({
        mimeType: 'image/jpeg',
        base64: (await readImage(projectFilePath(id, c.portraitPath as string))).toString('base64'),
      })),
    );

    const { buffer, interactionId: _interactionId } = await gemini.generateIllustration(
      { name: chapter.name, prompt: chapter.prompt },
      project.style ?? '',
      referencePortraits,
    );

    const relPath = `chapters/${i}.jpg`;
    await saveImage(chapterImagePath(id, i), buffer);
    await updateProject(id, (p) => {
      const chapters = [...p.chapters];
      chapters[i] = { ...chapters[i], illustrationStatus: 'done', illustrationPath: relPath };
      return { ...p, chapters };
    });
  }

  await updateProject(id, (p) => ({
    ...p,
    status: STATUS_AFTER_STEP.ILLUSTRATIONS,
    stepState: 'IDLE',
    stepStartedAt: null,
  }));
}
