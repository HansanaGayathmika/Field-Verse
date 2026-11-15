import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { cookieSecure } from '../config/env';
import { isDbReady } from '../config/db';
import { Session } from '../models/Session';
import { dbUnavailable } from '../utils/errors';

export const SESSION_COOKIE = 'fv_sid';
const SESSION_DAYS = 30;

export interface Identity {
  sessionId: string;
  guestId: string;
  userId: string | null;
  /** "user:<id>" for registered users, "guest:<uuid>" for anonymous demo users. */
  ownerKey: string;
  ownerType: 'user' | 'guest';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      identity?: Identity;
    }
  }
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

function toIdentity(s: { _id: unknown; guestId: string; userId?: unknown }): Identity {
  const userId = s.userId ? String(s.userId) : null;
  return {
    sessionId: String(s._id),
    guestId: s.guestId,
    userId,
    ownerKey: userId ? `user:${userId}` : `guest:${s.guestId}`,
    ownerType: userId ? 'user' : 'guest',
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/' });
}

/** Load identity from the session cookie, if any. Never fails the request. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string' || !isDbReady()) return next();
  try {
    const s = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
    if (s) req.identity = toIdentity(s);
  } catch {
    /* ignore — treated as anonymous */
  }
  next();
}

export async function createSession(res: Response, opts: { userId?: string | null; guestId?: string }): Promise<Identity> {
  const token = randomBytes(32).toString('base64url');
  const s = await Session.create({
    tokenHash: hashToken(token),
    userId: opts.userId ?? null,
    guestId: opts.guestId ?? randomUUID(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
  });
  setSessionCookie(res, token);
  return toIdentity(s);
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token && isDbReady()) await Session.deleteOne({ tokenHash: hashToken(token) });
  clearSessionCookie(res);
}

/** Ensure the request has an owner identity (creates an anonymous guest session if needed). */
export async function ensureSession(req: Request, res: Response, next: NextFunction) {
  if (!isDbReady()) return next(dbUnavailable());
  if (!req.identity) req.identity = await createSession(res, {});
  next();
}

/** Require any existing identity (guest or user) — used for reads so we never create sessions on GET. */
export function requireIdentityOrEmpty(_req: Request, _res: Response, next: NextFunction) {
  if (!isDbReady()) return next(dbUnavailable());
  next();
}
