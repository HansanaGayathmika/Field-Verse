import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { corsOrigins } from '../config/env';
import { AppError } from '../utils/errors';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[\w-]{6,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-fieldverse-client';

/**
 * CSRF protection for cookie-authenticated, state-changing requests:
 *  1. A custom header is required (cannot be sent cross-site without a CORS preflight,
 *     and CORS only allows our configured origins).
 *  2. When an Origin header is present it must be an allowed origin.
 * Combined with SameSite=Lax HTTP-only cookies.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  if (req.header(CSRF_HEADER) !== '1') {
    return next(new AppError(403, 'CSRF_REJECTED', 'Request blocked: missing client header.'));
  }
  const origin = req.header('origin');
  if (origin && !corsOrigins.includes(origin)) {
    const host = req.header('host');
    const sameHost = host && (origin === `http://${host}` || origin === `https://${host}`);
    if (!sameHost) return next(new AppError(403, 'CSRF_REJECTED', 'Request blocked: origin not allowed.'));
  }
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.identity?.userId) return next(new AppError(401, 'UNAUTHORIZED', 'Please log in to continue.'));
  next();
}

/** Moderators and admins only. The role is read from the database on every request (never trusted from the client). */
export async function requireModerator(req: Request, _res: Response, next: NextFunction) {
  if (!req.identity?.userId) return next(new AppError(401, 'UNAUTHORIZED', 'Please log in to continue.'));
  const { User } = await import('../models/User');
  const user = await User.findById(req.identity.userId).select('role').lean();
  if (!user || !['moderator', 'admin'].includes(user.role as string)) return next(new AppError(403, 'FORBIDDEN', 'Only community moderators can do this.'));
  next();
}
