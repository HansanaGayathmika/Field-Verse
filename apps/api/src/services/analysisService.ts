import { createHash } from 'node:crypto';
import type {
  ClimateScenarioRequest,
  GapAnalysisRequest,
  RotationComparisonRequest,
} from '@fieldverse/contracts';
import { env } from '../config/env';
import { isDbReady } from '../config/db';
import { EngineCache } from '../models/EngineCache';
import type { AnalysisProvider } from '../adapters/analysis';
import { logger } from '../utils/logger';

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

const memory = new Map<string, { expires: number; value: unknown }>();
const MEMORY_MAX = 200;

/**
 * Caches REMOTE (ML service) responses only — demo responses are instant and are
 * regenerated so the "generatedAt" timestamp stays honest. MongoDB EngineCache is used
 * when connected (TTL index), with a small in-memory fallback.
 */
async function cached<T>(provider: AnalysisProvider, op: string, request: unknown, run: () => Promise<T>): Promise<{ value: T; cacheHit: boolean }> {
  if (provider.mode !== 'remote') return { value: await run(), cacheHit: false };
  const key = createHash('sha256').update(`${provider.mode}|${op}|${stableStringify(request)}`).digest('hex');
  const now = Date.now();

  const mem = memory.get(key);
  if (mem && mem.expires > now) return { value: mem.value as T, cacheHit: true };
  if (isDbReady()) {
    try {
      const hit = await EngineCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
      if (hit) return { value: hit.response as T, cacheHit: true };
    } catch (err) {
      logger.warn('EngineCache read failed', { error: (err as Error).message });
    }
  }

  const value = await run();
  const expires = now + env.ENGINE_CACHE_TTL_SECONDS * 1000;
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value!);
  memory.set(key, { expires, value });
  if (isDbReady()) {
    EngineCache.updateOne(
      { key },
      { $set: { key, provider: provider.mode, operation: op, response: value, modelVersion: (value as { modelVersion?: string }).modelVersion ?? null, expiresAt: new Date(expires) } },
      { upsert: true },
    ).catch((err) => logger.warn('EngineCache write failed', { error: (err as Error).message }));
  }
  return { value, cacheHit: false };
}

export const analysisService = {
  compare: (p: AnalysisProvider, req: RotationComparisonRequest) => cached(p, 'compare', req, () => p.compareRotations(req)),
  scenario: (p: AnalysisProvider, req: ClimateScenarioRequest) => cached(p, 'scenario', req, () => p.analyzeScenario(req)),
  gaps: (p: AnalysisProvider, req: GapAnalysisRequest) => cached(p, 'gaps', req, () => p.analyzeGaps(req)),
  clearMemoryCache: () => memory.clear(),
};
