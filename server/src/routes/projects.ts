import { Router } from 'express';
import {
  createProject,
  listProjectsForUser,
  readProject,
  readBookText,
} from '../lib/store.js';
import { requireAuth } from '../lib/auth.js';
import { startStep, isOrphanedRunning, StepOrderError, StepBusyError } from '../lib/pipeline.js';
import { STEP_KEYS, currentStep, type Project, type StepKey } from '../lib/types.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

function summarize(p: Project) {
  return {
    id: p.id,
    title: p.title,
    createdAt: p.createdAt,
    status: p.status,
    stepState: p.stepState,
    stuck: isOrphanedRunning(p),
  };
}

function serializeDetail(p: Project, bookText: string) {
  return {
    ...p,
    bookText,
    currentStep: currentStep(p.status) ?? null,
    stuck: isOrphanedRunning(p),
  };
}

projectsRouter.get('/', async (req, res) => {
  const projects = await listProjectsForUser(req.user!.email);
  res.json({ projects: projects.map(summarize) });
});

projectsRouter.post('/', async (req, res) => {
  const { title, bookText } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'Project title is required' });
    return;
  }
  if (typeof bookText !== 'string' || !bookText.trim()) {
    res.status(400).json({ error: 'Book text is required (paste it or upload a .txt file)' });
    return;
  }
  const project = await createProject({
    userEmail: req.user!.email,
    title: title.trim(),
    bookText,
  });
  res.status(201).json({ project: serializeDetail(project, bookText) });
});

async function loadOwnedProject(req: any, res: any): Promise<Project | null> {
  const project = await readProject(req.params.id);
  if (!project || project.userEmail !== req.user.email) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  return project;
}

projectsRouter.get('/:id', async (req, res) => {
  const project = await loadOwnedProject(req, res);
  if (!project) return;
  const bookText = await readBookText(project.id);
  res.json({ project: serializeDetail(project, bookText) });
});

projectsRouter.post('/:id/steps/:step/run', async (req, res) => {
  const project = await loadOwnedProject(req, res);
  if (!project) return;

  const step = req.params.step.toUpperCase() as StepKey;
  if (!STEP_KEYS.includes(step)) {
    res.status(400).json({ error: `Unknown step ${req.params.step}` });
    return;
  }

  const userStyle = typeof req.body?.userStyle === 'string' ? req.body.userStyle : undefined;

  try {
    const started = await startStep(project.id, step, { userStyle });
    const bookText = await readBookText(project.id);
    res.status(202).json({ project: serializeDetail(started, bookText) });
  } catch (err) {
    if (err instanceof StepBusyError) {
      res.status(409).json({ error: err.message });
    } else if (err instanceof StepOrderError) {
      res.status(409).json({ error: err.message });
    } else {
      res.status(500).json({ error: (err as Error).message });
    }
  }
});
