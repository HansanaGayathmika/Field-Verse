import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ref from '../controllers/referenceController';
import * as analysis from '../controllers/analysisController';
import * as fields from '../controllers/fieldController';
import * as scenarios from '../controllers/scenarioController';
import * as auth from '../controllers/authController';
import { ensureSession, requireIdentityOrEmpty } from '../middleware/session';
import { requireUser } from '../middleware/security';
import { isProd, isTest } from '../config/env';
import type { ApiError } from '@fieldverse/contracts';

const limitHandler = (message: string) => (_req: any, res: any) => {
  const body: ApiError = { error: { code: 'RATE_LIMITED', message } };
  res.status(429).json(body);
};
const analysisLimiter = rateLimit({ windowMs: 60_000, limit: isTest ? 10_000 : 60, standardHeaders: 'draft-7', legacyHeaders: false, handler: limitHandler('Too many analysis requests. Please wait a minute.') });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: isTest ? 10_000 : isProd ? 20 : 200, standardHeaders: 'draft-7', legacyHeaders: false, handler: limitHandler('Too many attempts. Please wait 15 minutes.') });

export const apiRouter = Router();

/* Status */
apiRouter.get('/health', analysis.health);
apiRouter.get('/analysis/status', analysis.analysisStatus);
apiRouter.get('/data-sources/status', analysis.dataSourcesStatus);

/* Reference data (public) */
apiRouter.get('/regions', ref.listRegions);
apiRouter.get('/regions/:id', ref.getRegion);
apiRouter.get('/crops', ref.listCrops);
apiRouter.get('/crops/:id', ref.getCrop);
apiRouter.get('/observations/point', analysisLimiter, ref.getPointObservations);
apiRouter.get('/observations', ref.getObservations);
apiRouter.get('/geocode', analysisLimiter, ref.geocode);

/* Analysis (public demo — no signup, nothing persisted) */
apiRouter.post('/rotations/compare', analysisLimiter, analysis.compareRotations);
apiRouter.post('/rotations/scenario', analysisLimiter, analysis.analyzeScenario);
apiRouter.post('/gaps/analyze', analysisLimiter, analysis.analyzeGaps);
apiRouter.post('/recommend', analysisLimiter, analysis.recommend);

/* Fields — owner-scoped (guest session or account) */
apiRouter.get('/fields', requireIdentityOrEmpty, fields.listFields);
apiRouter.post('/fields', ensureSession, fields.createField);
apiRouter.get('/fields/:id', requireIdentityOrEmpty, fields.getField);
apiRouter.patch('/fields/:id', requireIdentityOrEmpty, fields.updateField);
apiRouter.delete('/fields/:id', requireIdentityOrEmpty, fields.deleteField);

/* Saved scenarios — owner-scoped */
apiRouter.get('/scenarios', requireIdentityOrEmpty, scenarios.listScenarios);
apiRouter.post('/scenarios', ensureSession, scenarios.createScenario);
apiRouter.get('/scenarios/:id', requireIdentityOrEmpty, scenarios.getScenario);
apiRouter.delete('/scenarios/:id', requireIdentityOrEmpty, scenarios.deleteScenario);

/* Accounts (optional — the public demo never requires one) */
apiRouter.get('/auth/session', auth.session);
apiRouter.post('/auth/register', authLimiter, requireIdentityOrEmpty, auth.register);
apiRouter.post('/auth/login', authLimiter, requireIdentityOrEmpty, auth.login);
apiRouter.post('/auth/logout', auth.logout);
apiRouter.patch('/auth/account', requireIdentityOrEmpty, requireUser, auth.updateAccount);
apiRouter.delete('/auth/account', authLimiter, requireIdentityOrEmpty, requireUser, auth.deleteAccount);
