import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/communityController';
import { requireIdentityOrEmpty } from '../middleware/session';
import { requireModerator, requireUser } from '../middleware/security';
import { isProd, isTest } from '../config/env';

const limit = (windowMs: number, prod: number, message: string, keyByUser = false) =>
  rateLimit({
    windowMs,
    limit: isTest ? 100_000 : isProd ? prod : prod * 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Per account for logged-in actions, otherwise per IP (no identity is logged).
    ...(keyByUser ? { keyGenerator: (req: any) => req.identity?.userId ?? req.ip } : {}),
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message } }),
  });

const readLimit = limit(60_000, 120, 'Too many requests. Please wait a minute.');
const postLimit = limit(60 * 60_000, 10, 'You are sharing very quickly. Please wait a while before sharing again.', true);
const actionLimit = limit(60_000, 60, 'Too many actions. Please wait a minute.', true);

/** Mounted at /api/v1/community. Every route needs MongoDB (requireIdentityOrEmpty returns 503 otherwise). */
export const communityRouter = Router();
communityRouter.use(requireIdentityOrEmpty);

// Public (browsing does not require an account)
communityRouter.get('/experiences', readLimit, c.feed);
communityRouter.get('/experiences/:id', readLimit, c.getExperience);
communityRouter.get('/experiences/:id/related', readLimit, c.related);
communityRouter.get('/locations', readLimit, c.locations);
communityRouter.get('/locations/resolve', readLimit, c.resolveLocation);
communityRouter.get('/categories', readLimit, c.categories);

// Signed-in farmers
communityRouter.post('/experiences', requireUser, postLimit, c.createExperience);
communityRouter.get('/my-experiences', requireUser, c.myExperiences);
communityRouter.patch('/experiences/:id', requireUser, actionLimit, c.updateExperience);
communityRouter.delete('/experiences/:id', requireUser, actionLimit, c.deleteExperience);
communityRouter.post('/experiences/:id/helpful', requireUser, actionLimit, c.markHelpful);
communityRouter.delete('/experiences/:id/helpful', requireUser, actionLimit, c.unmarkHelpful);
communityRouter.post('/experiences/:id/report', requireUser, actionLimit, c.report);

// Moderators (role checked in the database on every request)
communityRouter.get('/moderation/queue', requireModerator, c.queue);
communityRouter.patch('/moderation/:id', requireModerator, c.moderate);
