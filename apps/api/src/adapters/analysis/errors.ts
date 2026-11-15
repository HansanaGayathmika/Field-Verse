import type { ApiErrorCode } from '@fieldverse/contracts';
import { AppError } from '../../utils/errors';

/** Errors raised by analysis providers. Mapped to HTTP status codes for the React app. */
export class AnalysisError extends AppError {
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(STATUS[code] ?? 500, code, message, details);
    this.name = 'AnalysisError';
  }
}

const STATUS: Partial<Record<ApiErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  REGION_NOT_SUPPORTED: 422,
  CROP_NOT_SUPPORTED: 422,
  SCENARIO_NOT_SUPPORTED: 422,
  DATA_UNAVAILABLE: 422,
  ANALYSIS_UNAVAILABLE: 503,
  ANALYSIS_TIMEOUT: 504,
  ANALYSIS_BAD_RESPONSE: 502,
  INTERNAL_ERROR: 500,
};
