import { Router } from 'express';
import { readProject, readImage, projectFilePath } from '../lib/store.js';
import { requireAuth } from '../lib/auth.js';

export const filesRouter = Router();
filesRouter.use(requireAuth);

// Images live on the local filesystem (no S3/CDN per spec) and are only
// servable through this route, which checks project ownership first.
filesRouter.get('/:projectId/:kind(portraits|chapters)/:index', async (req, res) => {
  const project = await readProject(req.params.projectId);
  if (!project || project.userEmail !== req.user!.email) {
    res.status(404).end();
    return;
  }
  const index = Number(req.params.index);
  const items = req.params.kind === 'portraits' ? project.characters : project.chapters;
  const item = items[index] as { portraitPath?: string | null; illustrationPath?: string | null } | undefined;
  const relPath = item?.portraitPath ?? item?.illustrationPath;
  if (!relPath) {
    res.status(404).end();
    return;
  }
  try {
    const buf = await readImage(projectFilePath(project.id, relPath));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(buf);
  } catch {
    res.status(404).end();
  }
});
