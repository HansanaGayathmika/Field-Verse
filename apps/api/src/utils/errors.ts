import type { ApiErrorCode } from '@fieldverse/contracts';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} was not found.`);
export const dbUnavailable = () =>
  new AppError(
    503,
    'DATABASE_UNAVAILABLE',
    'Saving is temporarily unavailable because the database is not connected. The public demo still works.',
  );
