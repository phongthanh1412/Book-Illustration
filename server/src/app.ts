import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { filesRouter } from './routes/files.js';

const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'dev-only-secret-change-me';

// Split from index.ts so tests can drive real HTTP requests (supertest)
// against this app without binding a port.
export const app = express();

app.use(cors({ origin: WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' })); // book texts can be sizeable
app.use(cookieParser(COOKIE_SECRET));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/files', filesRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
