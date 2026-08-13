import { Router } from 'express';
import { findOrCreateUser } from '../lib/store.js';
import { requireAuth, SESSION_COOKIE } from '../lib/auth.js';

export const authRouter = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  signed: true,
  sameSite: 'lax' as const,
  maxAge: 1000 * 60 * 60 * 24 * 30,
};

authRouter.post('/login', async (req, res) => {
  const { name, email } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'A name and a valid email are required' });
    return;
  }
  const user = await findOrCreateUser(email, name.trim());
  res.cookie(SESSION_COOKIE, user.email, COOKIE_OPTS);
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
