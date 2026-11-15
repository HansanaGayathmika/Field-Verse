import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ObservationsResponse } from '@fieldverse/contracts';
import { referenceData } from '../services/referenceData';
import { notFound, AppError } from '../utils/errors';
import { isDbReady } from '../config/db';
import { CropModel, RegionModel } from '../models/Reference';
import { CropSchema, RegionSchema } from '@fieldverse/contracts';
import { logger } from '../utils/logger';
import { getPointObservations as getPointObs } from '../services/pointObservations';
import { searchPlaces } from '../services/geocode';

/**
 * Reference data is served from MongoDB when connected and seeded, otherwise from the
 * versioned fixtures in /data/demo — so the public demo keeps working without a database.
 * The `X-Data-Origin` header tells which one was used.
 */
async function regionsFromDb() {
  if (!isDbReady()) return null;
  try {
    const docs = await RegionModel.find().sort({ regionId: 1 }).lean();
    if (!docs.length) return null;
    return docs.map((d) => {
      const region = RegionSchema.parse(d.content);
      // media (poster) is attached from fixtures at load time
      return { ...region, media: referenceData.getRegion(region.id)?.media ?? region.media ?? null };
    });
  } catch (err) {
    logger.warn('Region DB read failed, using fixtures', { error: (err as Error).message });
    return null;
  }
}

async function cropsFromDb() {
  if (!isDbReady()) return null;
  try {
    const docs = await CropModel.find().sort({ cropId: 1 }).lean();
    if (!docs.length) return null;
    return docs.map((d) => CropSchema.parse({ ...d, id: d.cropId }));
  } catch (err) {
    logger.warn('Crop DB read failed, using fixtures', { error: (err as Error).message });
    return null;
  }
}

export async function listRegions(_req: Request, res: Response) {
  const db = await regionsFromDb();
  res.setHeader('X-Data-Origin', db ? 'database' : 'fixtures');
  res.json({ regions: db ?? referenceData.listRegions() });
}

export async function getRegion(req: Request, res: Response) {
  const id = String(req.params.id);
  const db = await regionsFromDb();
  const region = (db ?? referenceData.listRegions()).find((r) => r.id === id);
  if (!region) throw notFound(`Region "${id}"`);
  res.setHeader('X-Data-Origin', db ? 'database' : 'fixtures');
  res.json({ region });
}

export async function listCrops(req: Request, res: Response) {
  const regionId = typeof req.query.regionId === 'string' ? req.query.regionId : undefined;
  const db = await cropsFromDb();
  let crops = db ?? referenceData.listCrops();
  if (regionId) crops = crops.filter((c) => c.regions.includes(regionId));
  res.setHeader('X-Data-Origin', db ? 'database' : 'fixtures');
  res.json({ crops });
}

export async function getCrop(req: Request, res: Response) {
  const id = String(req.params.id);
  const db = await cropsFromDb();
  const crop = (db ?? referenceData.listCrops()).find((c) => c.id === id);
  if (!crop) throw notFound(`Crop "${id}"`);
  res.json({ crop });
}

const PointQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });

/** Live NASA POWER (+ SoilGrids) observations for any location worldwide. */
export async function getPointObservations(req: Request, res: Response) {
  const parsed = PointQuery.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Query parameters "lat" (−90…90) and "lon" (−180…180) are required.');
  const r = await getPointObs(parsed.data.lat, parsed.data.lon);
  const body: ObservationsResponse = { regionId: 'custom', environment: r.environment, dataSources: r.dataSources, preparedAt: r.preparedAt };
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.json(body);
}

/** Search for a village or town (OpenStreetMap Nominatim, proxied and cached). */
export async function geocode(req: Request, res: Response) {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const results = await searchPlaces(q);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.json({ results, attribution: 'Search data © OpenStreetMap contributors (Nominatim)' });
}

const ObsQuery = z.object({ regionId: z.string().min(2).max(64) });

/** Prepared observations only — never live or fabricated values. */
export async function getObservations(req: Request, res: Response) {
  const parsed = ObsQuery.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Query parameter "regionId" is required.', { supportedRegions: referenceData.listRegions().map((r) => r.id) });
  const { regionId } = parsed.data;
  if (!referenceData.getRegion(regionId)) throw new AppError(422, 'REGION_NOT_SUPPORTED', `No prepared observations for region "${regionId}".`);
  const env = referenceData.getEnvironment(regionId);
  if (!env) throw new AppError(422, 'DATA_UNAVAILABLE', `Observations for "${regionId}" have not been prepared yet. Run "npm run data:prepare".`);
  const body: ObservationsResponse = { regionId, environment: env.environment, dataSources: env.dataSources, preparedAt: env.preparedAt };
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(body);
}
