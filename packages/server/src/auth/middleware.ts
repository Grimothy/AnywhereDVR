// packages/server/src/auth/middleware.ts
// Express middleware for authentication and authorization

import type { Request, Response, NextFunction } from 'express';
import { verifyToken, COOKIE_NAME } from './jwt.js';
import type { JwtPayload } from './jwt.js';

// Augment Express Request to carry the authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * requireAuth — verifies the JWT cookie. Attaches decoded payload to req.user.
 * Returns 401 if missing or invalid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  const payload = verifyToken(token as string);
  if (!payload) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    return;
  }

  req.user = payload;
  next();
}

/**
 * requireAdmin — must be used after requireAuth.
 * Returns 403 if the authenticated user is not an admin.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    return;
  }
  next();
}
