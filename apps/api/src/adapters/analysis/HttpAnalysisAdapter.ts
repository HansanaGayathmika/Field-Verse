import type { z } from 'zod';
import {
  AnalysisErrorBodySchema,
  ClimateScenarioResponseSchema,
  GapAnalysisResponseSchema,
  ModelInfoSchema,
  RotationComparisonResponseSchema,
  type ApiErrorCode,
  type ClimateScenarioRequest,
  type ClimateScenarioResponse,
  type GapAnalysisRequest,
  type GapAnalysisResponse,
  type ModelInfo,
  type RotationComparisonRequest,
  type RotationComparisonResponse,
} from '@fieldverse/contracts';
import { logger } from '../../utils/logger';
import type { AnalysisProvider } from './AnalysisProvider';
import { AnalysisError } from './errors';

export interface HttpAnalysisAdapterOptions {
  baseUrl: string;
  timeoutMs: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Endpoint paths expected on the AI/ML team's FastAPI service.
 * See docs/ML_HANDOFF.md. Change here (only) if the teams agree on different paths.
 */
export const ML_ENDPOINTS = {
  modelInfo: { method: 'GET', path: '/v1/model-info' },
  compareRotations: { method: 'POST', path: '/v1/rotations/compare' },
  analyzeScenario: { method: 'POST', path: '/v1/scenarios/analyze' },
  analyzeGaps: { method: 'POST', path: '/v1/gaps/analyze' },
} as const;

const ML_ERROR_MAP: Record<string, ApiErrorCode> = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REGION_NOT_SUPPORTED: 'REGION_NOT_SUPPORTED',
  CROP_NOT_SUPPORTED: 'CROP_NOT_SUPPORTED',
  SCENARIO_NOT_SUPPORTED: 'SCENARIO_NOT_SUPPORTED',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
  MODEL_NOT_READY: 'ANALYSIS_UNAVAILABLE',
  INTERNAL_ERROR: 'ANALYSIS_UNAVAILABLE',
};

/**
 * Calls the Python FastAPI analysis service. Every response is validated against the
 * shared contract; a non-conforming response is rejected (never passed to the UI).
 */
export class HttpAnalysisAdapter implements AnalysisProvider {
  readonly mode = 'remote' as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HttpAnalysisAdapterOptions) {
    if (!opts.baseUrl) throw new Error('HttpAnalysisAdapter requires ML_SERVICE_URL');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async call<S extends z.ZodTypeAny>(
    endpoint: (typeof ML_ENDPOINTS)[keyof typeof ML_ENDPOINTS],
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const url = `${this.baseUrl}${endpoint.path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: endpoint.method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      logger.warn('ML service request failed', { url, aborted, error: (err as Error).message });
      throw aborted
        ? new AnalysisError('ANALYSIS_TIMEOUT', `The analysis service did not respond within ${Math.round(this.opts.timeoutMs / 1000)} seconds.`)
        : new AnalysisError('ANALYSIS_UNAVAILABLE', 'The analysis service could not be reached.');
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new AnalysisError('ANALYSIS_BAD_RESPONSE', `The analysis service returned a non-JSON response (HTTP ${res.status}).`);
    }

    if (!res.ok) {
      const parsedErr = AnalysisErrorBodySchema.safeParse(json);
      if (parsedErr.success) {
        const code = ML_ERROR_MAP[parsedErr.data.error.code] ?? 'ANALYSIS_UNAVAILABLE';
        throw new AnalysisError(code, parsedErr.data.error.message, parsedErr.data.error.details);
      }
      throw new AnalysisError(res.status === 422 || res.status === 400 ? 'VALIDATION_ERROR' : 'ANALYSIS_UNAVAILABLE', `The analysis service returned HTTP ${res.status}.`);
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      logger.error('ML service response failed contract validation', { url, issues: parsed.error.issues.slice(0, 20) });
      throw new AnalysisError('ANALYSIS_BAD_RESPONSE', 'The analysis service returned data that does not match the agreed contract.', {
        issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if ((parsed.data as { mode?: string }).mode && (parsed.data as { mode?: string }).mode !== 'remote') {
      throw new AnalysisError('ANALYSIS_BAD_RESPONSE', 'The analysis service must report mode "remote".');
    }
    return parsed.data;
  }

  getModelInfo(): Promise<ModelInfo> {
    return this.call(ML_ENDPOINTS.modelInfo, ModelInfoSchema);
  }
  compareRotations(request: RotationComparisonRequest): Promise<RotationComparisonResponse> {
    return this.call(ML_ENDPOINTS.compareRotations, RotationComparisonResponseSchema, request);
  }
  analyzeScenario(request: ClimateScenarioRequest): Promise<ClimateScenarioResponse> {
    return this.call(ML_ENDPOINTS.analyzeScenario, ClimateScenarioResponseSchema, request);
  }
  analyzeGaps(request: GapAnalysisRequest): Promise<GapAnalysisResponse> {
    return this.call(ML_ENDPOINTS.analyzeGaps, GapAnalysisResponseSchema, request);
  }
}
