import type { NextFunction, Request, Response } from 'express';
import { getUser } from './store.js';
import type { User } from './types.js';

export const SESSION_COOKIE = 'session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** No password/OAuth per spec — a signed cookie holding the user's email is
 * the whole "session". Good enough for this scope; see DECISIONS.md. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const email = req.signedCookies?.[SESSION_COOKIE];
  if (!email) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  const user = await getUser(email);
  if (!user) {
    res.clearCookie(SESSION_COOKIE);
    res.status(401).json({ error: 'Session no longer valid' });
    return;
  }
  req.user = user;
  next();
}
