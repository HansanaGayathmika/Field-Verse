import { env } from '../../config/env';
import type { AnalysisProvider } from './AnalysisProvider';
import { DemoAnalysisAdapter } from './DemoAnalysisAdapter';
import { HttpAnalysisAdapter } from './HttpAnalysisAdapter';

export type { AnalysisProvider } from './AnalysisProvider';
export { AnalysisError } from './errors';
export { DemoAnalysisAdapter } from './DemoAnalysisAdapter';
export { HttpAnalysisAdapter } from './HttpAnalysisAdapter';

/**
 * Provider selection from configuration:
 *   ANALYSIS_PROVIDER=demo    → DemoAnalysisAdapter (no Python service needed)
 *   ANALYSIS_PROVIDER=remote  → HttpAnalysisAdapter(ML_SERVICE_URL)
 *
 * There is deliberately NO silent fallback from remote to demo. If the remote service
 * fails, Express returns an explicit error and the UI may OFFER a clearly labelled
 * switch to demo results (request header `X-Analysis-Mode: demo`).
 */
let configured: AnalysisProvider | null = null;
let demo: DemoAnalysisAdapter | null = null;

export function getDemoProvider(): DemoAnalysisAdapter {
  demo ??= new DemoAnalysisAdapter();
  return demo;
}

export function getAnalysisProvider(): AnalysisProvider {
  if (configured) return configured;
  if (env.ANALYSIS_PROVIDER === 'remote') {
    if (!env.ML_SERVICE_URL) {
      throw new Error('ANALYSIS_PROVIDER=remote requires ML_SERVICE_URL to be set.');
    }
    configured = new HttpAnalysisAdapter({
      baseUrl: env.ML_SERVICE_URL,
      timeoutMs: env.ML_SERVICE_TIMEOUT_MS,
      apiKey: env.ML_SERVICE_API_KEY || undefined,
    });
  } else {
    configured = getDemoProvider();
  }
  return configured;
}

/** Resolve the provider for one request. Demo can be explicitly requested by the user. */
export function resolveProvider(requestedMode?: string): AnalysisProvider {
  if (requestedMode === 'demo') return getDemoProvider();
  return getAnalysisProvider();
}

/** For tests only. */
export function setAnalysisProviderForTests(p: AnalysisProvider | null) {
  configured = p;
}
