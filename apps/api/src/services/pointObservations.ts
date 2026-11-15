import type { SourceRef } from '@fieldverse/contracts';
import { env } from '../config/env';
import { isDbReady } from '../config/db';
import { EngineCache } from '../models/EngineCache';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { buildEnvironment, type ObservationFixture } from './referenceData';

/**
 * Live observations for ANY location (worldwide), fetched on demand from free open services:
 *  - NASA POWER climatology + monthly/annual (required)
 *  - ISRIC SoilGrids 2.0 (optional; null if unavailable)
 * Vegetation (NDVI) and satellite videos are only prepared for the demo regions.
 *
 * Privacy: coordinates are rounded to 2 decimals (~1 km) before leaving our server,
 * and nothing about the user is sent.
 */
const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const round = (v: number | null | undefined, d = 1) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const CACHE_DAYS = 30;

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests inject a fake fetch. */
export function setObservationFetch(f: typeof fetch | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
  memory.clear();
}

const memory = new Map<string, { expires: number; value: unknown }>();

async function getJson(url: string, timeoutMs: number): Promise<any> {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'FieldVerse/0.1 (NASA Space Apps demo)' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchClimate(lat: number, lon: number, retrievedAt: string) {
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=PRECTOTCORR,T2M,T2M_MAX,T2M_MIN&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
  const json = await getJson(url, 25_000);
  const p = json.properties.parameter;
  const fill = json.header.fill_value;
  const v = (x: number) => (x === fill ? null : x);
  const monthly = MONTH_KEYS.map((k, i) => {
    const mmDay = v(p.PRECTOTCORR[k]);
    return {
      month: i + 1,
      rainfallMm: mmDay == null ? null : round(mmDay * DAYS_IN_MONTH[i], 0),
      rainfallMmPerDay: round(mmDay, 2),
      temperatureMeanC: round(v(p.T2M[k])),
      temperatureMaxC: round(v(p.T2M_MAX[k])),
      temperatureMinC: round(v(p.T2M_MIN[k])),
    };
  });
  const source: SourceRef = {
    id: 'nasa-power-climatology',
    name: 'NASA POWER — Climatology API',
    provider: 'NASA Langley Research Center (LaRC) POWER Project',
    sourceType: 'observed',
    datasetVersion: `POWER API ${json.header.api?.version ?? ''} (${(json.header.sources ?? []).join(', ')})`,
    spatialResolution: '0.5° × 0.625° (MERRA-2 grid)',
    temporalCoverage: json.header.range,
    url,
    retrievedAt,
    license: 'NASA open data — no restrictions; acknowledgement requested',
    notes: 'Fetched live for your location. Monthly rain = PRECTOTCORR (mm/day) × days in month. Values describe a ~50 km grid cell, not a farm rain gauge.',
  };
  return { monthly, period: String(json.header.range ?? '2001–2025'), source };
}

async function fetchAnnual(lat: number, lon: number, retrievedAt: string) {
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=PRECTOTCORR_SUM,T2M&community=AG&longitude=${lon}&latitude=${lat}&start=2015&end=2024&format=JSON`;
  const json = await getJson(url, 25_000);
  const p = json.properties.parameter;
  const fill = json.header.fill_value;
  const years = [];
  for (let y = 2015; y <= 2024; y++) {
    const t = p.PRECTOTCORR_SUM[`${y}13`];
    const tm = p.T2M[`${y}13`];
    years.push({ year: y, rainfallTotalMm: t === fill ? null : round(t, 0), temperatureMeanC: tm === fill ? null : round(tm) });
  }
  const source: SourceRef = {
    id: 'nasa-power-monthly',
    name: 'NASA POWER — Monthly & Annual API',
    provider: 'NASA Langley Research Center (LaRC) POWER Project',
    sourceType: 'observed',
    datasetVersion: `POWER API ${json.header.api?.version ?? ''}`,
    spatialResolution: '0.5° × 0.625° (MERRA-2 grid)',
    temporalCoverage: '2015–2024',
    url,
    retrievedAt,
    license: 'NASA open data — no restrictions; acknowledgement requested',
    notes: 'Fetched live for your location.',
  };
  return { years, source };
}

const SOIL_PROPS: Record<string, { key: string; factor: number }> = {
  phh2o: { key: 'phH2O', factor: 10 },
  soc: { key: 'organicCarbonGPerKg', factor: 10 },
  clay: { key: 'clayPercent', factor: 10 },
  sand: { key: 'sandPercent', factor: 10 },
  silt: { key: 'siltPercent', factor: 10 },
  nitrogen: { key: 'nitrogenGPerKg', factor: 100 },
  bdod: { key: 'bulkDensityGPerCm3', factor: 100 },
  cec: { key: 'cecCmolPerKg', factor: 10 },
};
const SOIL_DEPTHS = ['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm'];

async function fetchSoil(lat: number, lon: number, retrievedAt: string) {
  const props = Object.keys(SOIL_PROPS).map((p) => `property=${p}`).join('&');
  const depths = SOIL_DEPTHS.map((d) => `depth=${d}`).join('&');
  const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&${props}&${depths}&value=mean&value=Q0.05&value=Q0.95`;
  const json = await getJson(url, 15_000);
  const layers = SOIL_DEPTHS.map((label) => {
    const [top, bottom] = label.replace('cm', '').split('-').map(Number);
    const values: Record<string, number | null> = {};
    const intervals: Record<string, { lower: number; upper: number; level: number }> = {};
    for (const l of json.properties.layers ?? []) {
      const meta = SOIL_PROPS[l.name];
      if (!meta) continue;
      const d = l.depths.find((x: { label: string }) => x.label === label);
      const mean = d?.values?.mean;
      values[meta.key] = mean == null ? null : round(mean / meta.factor, 2);
      const lo = d?.values?.['Q0.05'];
      const hi = d?.values?.['Q0.95'];
      if (lo != null && hi != null) intervals[meta.key] = { lower: round(lo / meta.factor, 2)!, upper: round(hi / meta.factor, 2)!, level: 0.9 };
    }
    return { depthLabel: label, topCm: top, bottomCm: bottom, values, intervals };
  });
  const source: SourceRef = {
    id: 'isric-soilgrids-2',
    name: 'SoilGrids 2.0',
    provider: 'ISRIC — World Soil Information',
    sourceType: 'estimated',
    datasetVersion: 'SoilGrids 2.0 (2020 release)',
    spatialResolution: '250 m',
    url,
    retrievedAt,
    license: 'CC-BY 4.0',
    notes: 'Fetched live. Predictions from a global model, not a field soil test. Intervals are the 5th–95th percentile range.',
  };
  return { layers, source };
}

export async function getPointObservations(latIn: number, lonIn: number) {
  if (!env.LIVE_OBSERVATIONS) {
    throw new AppError(503, 'DATA_UNAVAILABLE', 'Live observations for custom locations are turned off on this server.');
  }
  const lat = Math.round(latIn * 100) / 100;
  const lon = Math.round(lonIn * 100) / 100;
  const key = `obs:${lat},${lon}`;
  const now = Date.now();

  const mem = memory.get(key);
  if (mem && mem.expires > now) return mem.value as ReturnType<typeof buildEnvironment> & { location: { latitude: number; longitude: number } };
  if (isDbReady()) {
    const hit = await EngineCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean().catch(() => null);
    if (hit) {
      memory.set(key, { expires: now + 3600_000, value: hit.response });
      return hit.response as any;
    }
  }

  const retrievedAt = new Date().toISOString();
  let climate: Awaited<ReturnType<typeof fetchClimate>>;
  let annual: Awaited<ReturnType<typeof fetchAnnual>>;
  try {
    [climate, annual] = await Promise.all([fetchClimate(lat, lon, retrievedAt), fetchAnnual(lat, lon, retrievedAt)]);
  } catch (err) {
    logger.warn('NASA POWER request failed', { lat, lon, error: (err as Error).message });
    throw new AppError(503, 'DATA_UNAVAILABLE', 'NASA climate data could not be fetched for this location right now. Please try again in a moment.');
  }
  let soil: Awaited<ReturnType<typeof fetchSoil>> | null = null;
  let soilFailed = false;
  try {
    soil = await fetchSoil(lat, lon, retrievedAt);
  } catch (err) {
    soilFailed = true; // temporary outage → cache only briefly so soil appears once the service recovers
    logger.warn('SoilGrids request failed', { lat, lon, error: (err as Error).message });
  }

  const fixture: ObservationFixture = {
    schemaVersion: '1.0',
    regionId: 'custom',
    location: { latitude: lat, longitude: lon },
    preparedAt: retrievedAt,
    climate,
    annual,
    soil: soil as ObservationFixture['soil'],
    vegetation: null,
    media: null,
  };
  const value = { ...buildEnvironment(fixture), location: { latitude: lat, longitude: lon } };
  const ttlMs = soilFailed ? 3600_000 : CACHE_DAYS * 86400_000;
  memory.set(key, { expires: now + Math.min(ttlMs, 3600_000), value });
  if (memory.size > 500) memory.delete(memory.keys().next().value!);
  if (isDbReady()) {
    EngineCache.updateOne(
      { key },
      { $set: { key, provider: 'demo', operation: 'observations', response: value, modelVersion: null, expiresAt: new Date(now + ttlMs) } },
      { upsert: true },
    ).catch((e) => logger.warn('Observation cache write failed', { error: (e as Error).message }));
  }
  return value;
}
