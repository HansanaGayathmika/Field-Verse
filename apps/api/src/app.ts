import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { corsOrigins, isTest } from './config/env';
import { apiRouter } from './routes';
import { communityRouter } from './routes/community';
import { requestId, csrfProtection, CSRF_HEADER } from './middleware/security';
import { loadSession } from './middleware/session';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', CSRF_HEADER, 'X-Analysis-Mode', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'X-Analysis-Provider', 'X-Analysis-Cache', 'X-Data-Origin'],
    }),
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60_000,
      limit: isTest ? 100_000 : 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } }),
    }),
  );
  app.use(express.json({ limit: '600kb' }));
  app.use(cookieParser());

  if (!isTest) {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        logger.info('request', {
          requestId: req.id,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          ms: Number((process.hrtime.bigint() - start) / 1_000_000n),
        });
      });
      next();
    });
  }

  app.use('/api/v1/community', csrfProtection, loadSession, communityRouter);
  app.use('/api/v1', csrfProtection, loadSession, apiRouter);
  app.get('/', (_req, res) => res.json({ name: 'FieldVerse API', docs: '/api/v1/health' }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
