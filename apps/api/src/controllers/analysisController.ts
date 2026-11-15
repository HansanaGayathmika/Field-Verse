import type { Request, Response } from 'express';
import {
  ClimateScenarioRequestSchema,
  GapAnalysisRequestSchema,
  RotationComparisonRequestSchema,
  type AnalysisStatus,
  type DataSourceStatus,
  type Health,
} from '@fieldverse/contracts';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { dbStatus } from '../config/db';
import { getAnalysisProvider, getDemoProvider, resolveProvider } from '../adapters/analysis';
import { analysisService } from '../services/analysisService';
import { referenceData } from '../services/referenceData';
import { DEMO_SOURCE, CROP_REFERENCE_SOURCE } from '../adapters/analysis/DemoAnalysisAdapter';

const startedAt = Date.now();
const VERSION = '0.1.0';

/** The user may explicitly ask for demo results (e.g. after the remote service failed). */
const requestedMode = (req: Request) => (req.header('x-analysis-mode') === 'demo' ? 'demo' : undefined);

function annotate(res: Response, mode: string, cacheHit: boolean) {
  res.setHeader('X-Analysis-Provider', mode);
  res.setHeader('X-Analysis-Cache', cacheHit ? 'hit' : 'miss');
  res.setHeader('Cache-Control', 'no-store');
}

export async function compareRotations(req: Request, res: Response) {
  const body = RotationComparisonRequestSchema.parse(req.body);
  const provider = resolveProvider(requestedMode(req));
  const { value, cacheHit } = await analysisService.compare(provider, body);
  annotate(res, provider.mode, cacheHit);
  res.json(value);
}

export async function analyzeScenario(req: Request, res: Response) {
  const body = ClimateScenarioRequestSchema.parse(req.body);
  const provider = resolveProvider(requestedMode(req));
  const { value, cacheHit } = await analysisService.scenario(provider, body);
  annotate(res, provider.mode, cacheHit);
  res.json(value);
}

export async function analyzeGaps(req: Request, res: Response) {
  const body = GapAnalysisRequestSchema.parse(req.body);
  const provider = resolveProvider(requestedMode(req));
  const { value, cacheHit } = await analysisService.gaps(provider, body);
  annotate(res, provider.mode, cacheHit);
  res.json(value);
}

export async function health(_req: Request, res: Response) {
  const db = dbStatus();
  const body: Health = {
    status: db.status === 'connected' ? 'ok' : 'degraded',
    version: VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    database: db,
    analysisProvider: env.ANALYSIS_PROVIDER,
    time: new Date().toISOString(),
  };
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
}

/** Reports the ACTUAL adapter state (calls the ML service's model-info in remote mode). */
export async function analysisStatus(_req: Request, res: Response) {
  const checkedAt = new Date().toISOString();
  let body: AnalysisStatus;
  try {
    const provider = getAnalysisProvider();
    const info = await provider.getModelInfo();
    body = {
      provider: provider.mode,
      configuredProvider: env.ANALYSIS_PROVIDER,
      status: info.status,
      name: info.name,
      modelVersion: info.modelVersion,
      serviceUrl: provider.mode === 'remote' ? env.ML_SERVICE_URL : null,
      capabilities: info.capabilities,
      supportedRegions: info.supportedRegions,
      scenarioPresets: info.scenarioPresets,
      message: info.notes ?? null,
      checkedAt,
    };
  } catch (err) {
    const demoInfo = await getDemoProvider().getModelInfo();
    body = {
      provider: env.ANALYSIS_PROVIDER,
      configuredProvider: env.ANALYSIS_PROVIDER,
      status: 'unavailable',
      name: 'Remote analysis service',
      modelVersion: null,
      serviceUrl: env.ML_SERVICE_URL || null,
      capabilities: null,
      supportedRegions: [],
      // Presets are offered only so the UI can present an explicit, labelled demo option.
      scenarioPresets: demoInfo.scenarioPresets,
      message: `${(err as Error).message} Demo results can be requested explicitly and will be labelled as demo.`,
      checkedAt,
    };
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
}

export async function dataSourcesStatus(_req: Request, res: Response) {
  const map = new Map<string, DataSourceStatus['sources'][number]>();
  for (const region of referenceData.listRegions()) {
    const envd = referenceData.getEnvironment(region.id);
    for (const s of envd?.dataSources ?? []) {
      const usedFor = s.id.startsWith('nasa-power')
        ? ['Rainfall & temperature charts', 'Irrigation rule', 'Scenario baseline']
        : s.id.startsWith('isric')
          ? ['Soil profile', 'Roots of Tomorrow soil layers']
          : s.id.startsWith('modis')
            ? ['Vegetation (NDVI) chart']
            : s.id.startsWith('nasa-gibs')
              ? ['Satellite timelapse video']
              : [];
      const existing = map.get(s.id);
      if (existing) existing.regions.push(region.id);
      else map.set(s.id, { ...s, url: s.url ?? null, usedFor, regions: [region.id], status: 'prepared' });
    }
  }
  map.set(DEMO_SOURCE.id, {
    ...DEMO_SOURCE,
    usedFor: ['Rotation strategies', 'Scenario descriptions', 'Gap candidates', 'Illustrative ratings'],
    regions: referenceData.listRegions().map((r) => r.id),
    status: 'demo',
  });
  map.set(CROP_REFERENCE_SOURCE.id, {
    ...CROP_REFERENCE_SOURCE,
    usedFor: ['Crop durations', 'Water needs', 'Tolerances'],
    regions: referenceData.listRegions().map((r) => r.id),
    status: 'prepared',
  });
  const body: DataSourceStatus = { sources: [...map.values()], checkedAt: new Date().toISOString() };
  res.json(body);
}

/**
 * Roots of Tomorrow /recommend page: forwards the farmer's answers (FarmerInput, UI_TEAM_PROMPT.md)
 * to the ML service's raw engine endpoint and returns its answer unchanged. A 422 keeps its `{ detail }`
 * body so the page can show the engine's message.
 */
export async function recommend(req: Request, res: Response) {
  if (!env.ML_SERVICE_URL) throw new AppError(503, 'ANALYSIS_UNAVAILABLE', 'The recommendation engine is not configured.');
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    throw new AppError(400, 'VALIDATION_ERROR', 'Expected the farmer answers as a JSON object.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ML_SERVICE_TIMEOUT_MS);
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${env.ML_SERVICE_URL.replace(/\/+$/, '')}/api/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(env.ML_SERVICE_API_KEY ? { Authorization: `Bearer ${env.ML_SERVICE_API_KEY}` } : {}),
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
  } catch (err) {
    throw (err as Error).name === 'AbortError'
      ? new AppError(504, 'ANALYSIS_TIMEOUT', 'The recommendation engine took too long to answer.')
      : new AppError(503, 'ANALYSIS_UNAVAILABLE', 'The recommendation engine could not be reached.');
  } finally {
    clearTimeout(timer);
  }
  const body = await upstream.json().catch(() => null);
  if (body === null) throw new AppError(502, 'ANALYSIS_BAD_RESPONSE', 'The recommendation engine sent a response we could not read.');
  res.setHeader('Cache-Control', 'no-store');
  res.status(upstream.ok || upstream.status === 422 ? upstream.status : 502).json(body);
}
