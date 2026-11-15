import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CropSchema,
  RegionSchema,
  SoilLayerSchema,
  SourceRefSchema,
  type Crop,
  type EnvironmentSummary,
  type Region,
  type SourceRef,
} from '@fieldverse/contracts';
import { env } from '../config/env';

/* ------------------------------------------------------------------ */
/* Locate the /data/demo directory (works from src/ via tsx and dist/). */
/* ------------------------------------------------------------------ */
function findDataDir(): string {
  if (env.DEMO_DATA_DIR) return path.resolve(env.DEMO_DATA_DIR);
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, 'data', 'demo', 'index.json');
      if (existsSync(candidate)) return path.dirname(candidate);
      dir = path.dirname(dir);
    }
  }
  throw new Error('Could not locate data/demo/index.json. Set DEMO_DATA_DIR.');
}

export const DATA_DIR = findDataDir();
const readJson = (rel: string) => JSON.parse(readFileSync(path.join(DATA_DIR, rel), 'utf8'));

/* ------------------------------------------------------------------ */
/* Fixture schemas (internal to the SE demo; the ML team does not need them). */
/* ------------------------------------------------------------------ */
const InlineSourceSchema = SourceRefSchema;

const ObservationFixtureSchema = z.object({
  schemaVersion: z.literal('1.0'),
  regionId: z.string(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  preparedAt: z.string(),
  climate: z.object({
    monthly: z
      .array(
        z.object({
          month: z.number(),
          rainfallMm: z.number().nullable(),
          rainfallMmPerDay: z.number().nullable(),
          temperatureMeanC: z.number().nullable(),
          temperatureMaxC: z.number().nullable(),
          temperatureMinC: z.number().nullable(),
        }),
      )
      .length(12),
    period: z.string(),
    source: InlineSourceSchema,
  }),
  annual: z.object({
    years: z.array(z.object({ year: z.number(), rainfallTotalMm: z.number().nullable(), temperatureMeanC: z.number().nullable() })),
    source: InlineSourceSchema,
  }),
  soil: z.object({ layers: z.array(SoilLayerSchema), source: InlineSourceSchema }).nullable(),
  vegetation: z.object({ ndvi: z.array(z.object({ date: z.string(), ndvi: z.number().nullable() })), source: InlineSourceSchema }).nullable(),
  media: z
    .object({
      ndviTimelapse: z.object({
        webm: z.string(),
        mp4: z.string(),
        poster: z.string(),
        year: z.number(),
        framesPerSecond: z.number(),
        boundingBox: z.object({ minLat: z.number(), minLon: z.number(), maxLat: z.number(), maxLon: z.number() }),
        source: InlineSourceSchema,
      }),
    })
    .nullable(),
});
export type ObservationFixture = z.infer<typeof ObservationFixtureSchema>;

const IndexSchema = z.object({
  regions: z.array(z.object({ id: z.string(), folder: z.string() })),
});

/* ------------------------------------------------------------------ */
interface RegionBundle {
  region: Region;
  folder: string;
  observations: ObservationFixture | null;
  rotations: unknown;
  scenarios: unknown;
  gaps: unknown;
}

let cache: { regions: Map<string, RegionBundle>; crops: Map<string, Crop> } | null = null;

function load() {
  if (cache) return cache;
  const index = IndexSchema.parse(readJson('index.json'));
  const crops = new Map<string, Crop>();
  for (const c of z.object({ crops: z.array(CropSchema) }).parse(readJson('crops.json')).crops) crops.set(c.id, c);

  const regions = new Map<string, RegionBundle>();
  for (const { id, folder } of index.regions) {
    const region = RegionSchema.parse(readJson(`${folder}/region.json`));
    if (region.id !== id) throw new Error(`Region id mismatch in ${folder}/region.json`);
    const obsPath = path.join(DATA_DIR, folder, 'observations.json');
    const observations = existsSync(obsPath) ? ObservationFixtureSchema.parse(readJson(`${folder}/observations.json`)) : null;
    if (observations?.media?.ndviTimelapse) region.media = { poster: observations.media.ndviTimelapse.poster };
    regions.set(id, {
      region,
      folder,
      observations,
      rotations: readJson(`${folder}/rotations.json`),
      scenarios: readJson(`${folder}/scenarios.json`),
      gaps: readJson(`${folder}/gaps.json`),
    });
  }
  cache = { regions, crops };
  return cache;
}

export const referenceData = {
  reload() {
    cache = null;
    return load();
  },
  listRegions(): Region[] {
    return [...load().regions.values()].map((b) => b.region);
  },
  getRegion(id: string): Region | null {
    return load().regions.get(id)?.region ?? null;
  },
  getBundle(id: string): RegionBundle | null {
    return load().regions.get(id) ?? null;
  },
  listCrops(): Crop[] {
    return [...load().crops.values()];
  },
  getCrop(id: string): Crop | null {
    return load().crops.get(id) ?? null;
  },
  getObservationFixture(regionId: string) {
    return load().regions.get(regionId)?.observations ?? null;
  },
  /** Convert a fixture into the contract's EnvironmentSummary + source list. */
  getEnvironment(regionId: string): { environment: EnvironmentSummary; dataSources: SourceRef[]; preparedAt: string } | null {
    const obs = this.getObservationFixture(regionId);
    if (!obs) return null;
    return buildEnvironment(obs);
  },
};

export function buildEnvironment(fixture: ObservationFixture): { environment: EnvironmentSummary; dataSources: SourceRef[]; preparedAt: string } {
  // A soil block whose layers contain no values at all is "unavailable", not an estimate.
  const soilHasValues = fixture.soil?.layers.some((l) => Object.values(l.values).some((v) => v != null)) ?? false;
  const ndviHasValues = fixture.vegetation?.ndvi.some((p) => p.ndvi != null) ?? false;
  const obs: ObservationFixture = { ...fixture, soil: soilHasValues ? fixture.soil : null, vegetation: ndviHasValues ? fixture.vegetation : null };
  const sources: SourceRef[] = [obs.climate.source, obs.annual.source];
  if (obs.soil) sources.push(obs.soil.source);
  if (obs.vegetation) sources.push(obs.vegetation.source);
  if (obs.media?.ndviTimelapse) sources.push(obs.media.ndviTimelapse.source);

  const rain = obs.climate.monthly.map((m) => m.rainfallMm);
  const temps = obs.climate.monthly.map((m) => m.temperatureMeanC);
  const annualRain = rain.every((v) => v != null) ? Math.round(rain.reduce((a, b) => a! + b!, 0)!) : null;
  const meanTemp = temps.every((v) => v != null) ? Math.round((temps.reduce((a, b) => a! + b!, 0)! / 12) * 10) / 10 : null;
  const top = obs.soil?.layers[0];
  const ndviVals = obs.vegetation?.ndvi.map((n) => n.ndvi).filter((v): v is number => v != null) ?? [];
  const meanNdvi = ndviVals.length ? Math.round((ndviVals.reduce((a, b) => a + b, 0) / ndviVals.length) * 100) / 100 : null;

  const environment: EnvironmentSummary = {
    location: obs.location,
    climate: { monthly: obs.climate.monthly, period: obs.climate.period, sourceId: obs.climate.source.id, sourceType: 'observed' },
    annual: { years: obs.annual.years, sourceId: obs.annual.source.id, sourceType: 'observed' },
    soil: obs.soil ? { layers: obs.soil.layers, sourceId: obs.soil.source.id, sourceType: 'estimated' } : null,
    vegetation: obs.vegetation ? { ndvi: obs.vegetation.ndvi, sourceId: obs.vegetation.source.id, sourceType: 'observed' } : null,
    media: obs.media?.ndviTimelapse
      ? {
          ndviTimelapse: {
            webm: obs.media.ndviTimelapse.webm,
            mp4: obs.media.ndviTimelapse.mp4,
            poster: obs.media.ndviTimelapse.poster,
            year: obs.media.ndviTimelapse.year,
            framesPerSecond: obs.media.ndviTimelapse.framesPerSecond,
            boundingBox: obs.media.ndviTimelapse.boundingBox,
            sourceId: obs.media.ndviTimelapse.source.id,
          },
        }
      : null,
    highlights: {
      annualRainfallMm: { value: annualRain, unit: 'mm/year', sourceType: 'observed', sourceId: obs.climate.source.id, period: obs.climate.period },
      meanTemperatureC: { value: meanTemp, unit: '°C', sourceType: 'observed', sourceId: obs.climate.source.id, period: obs.climate.period },
      topsoilPh: top
        ? { value: top.values.phH2O ?? null, unit: 'pH', sourceType: 'estimated', sourceId: obs.soil!.source.id, interval: top.intervals?.phH2O ?? null, period: top.depthLabel }
        : { value: null, unit: 'pH', sourceType: 'unavailable' },
      topsoilOrganicCarbonGPerKg: top
        ? {
            value: top.values.organicCarbonGPerKg ?? null,
            unit: 'g/kg',
            sourceType: 'estimated',
            sourceId: obs.soil!.source.id,
            interval: top.intervals?.organicCarbonGPerKg ?? null,
            period: top.depthLabel,
          }
        : { value: null, unit: 'g/kg', sourceType: 'unavailable' },
      meanNdvi: obs.vegetation
        ? { value: meanNdvi, unit: 'NDVI (0–1)', sourceType: 'observed', sourceId: obs.vegetation.source.id, period: '2023–2024' }
        : { value: null, unit: 'NDVI', sourceType: 'unavailable' },
    },
  };
  return { environment, dataSources: sources, preparedAt: obs.preparedAt };
}
