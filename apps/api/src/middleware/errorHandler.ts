import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import type { ApiError } from '@fieldverse/contracts';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  const body: ApiError = { error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found.`, requestId: req.id } };
  res.status(404).json(body);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let body: ApiError = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', requestId: req.id } };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details, requestId: req.id } };
    if (
      env.ALLOW_DEMO_FALLBACK_OFFER &&
      ['ANALYSIS_UNAVAILABLE', 'ANALYSIS_TIMEOUT', 'ANALYSIS_BAD_RESPONSE'].includes(err.code)
    ) {
      body.error.details = { ...(typeof err.details === 'object' && err.details ? err.details : {}), demoFallbackAvailable: true };
    }
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some information is missing or not valid.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        requestId: req.id,
      },
    };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 404;
    body = { error: { code: 'NOT_FOUND', message: 'The requested item was not found.', requestId: req.id } };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = { error: { code: 'VALIDATION_ERROR', message: err.message, requestId: req.id } };
  } else if ((err as { type?: string })?.type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.', requestId: req.id } };
  } else if ((err as { type?: string })?.type === 'entity.too.large') {
    status = 413;
    body = { error: { code: 'VALIDATION_ERROR', message: 'Request body is too large.', requestId: req.id } };
  }

  if (status >= 500) logger.error('Request failed', { requestId: req.id, path: req.path, error: (err as Error)?.message, stack: env.NODE_ENV !== 'production' ? (err as Error)?.stack : undefined });
  else logger.debug('Request rejected', { requestId: req.id, path: req.path, code: body.error.code });

  res.status(status).json(body);
}
