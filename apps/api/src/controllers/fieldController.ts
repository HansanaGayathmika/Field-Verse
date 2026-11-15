import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { FieldInputSchema, FieldUpdateSchema, type FieldRecord } from '@fieldverse/contracts';
import { Field } from '../models/Field';
import { env } from '../config/env';
import { referenceData } from '../services/referenceData';
import { AppError, notFound } from '../utils/errors';

type FieldDoc = InstanceType<typeof Field>;

export function toFieldRecord(d: FieldDoc | Record<string, any>): FieldRecord {
  const doc = d as any;
  return {
    id: String(doc._id),
    farmName: doc.farmName,
    regionId: doc.regionId,
    ownerType: doc.ownerType,
    field: {
      latitude: doc.location.coordinates[1],
      longitude: doc.location.coordinates[0],
      currentCrop: doc.currentCrop,
      cropHistory: doc.cropHistory ?? [],
      soilType: doc.soil?.type ?? 'unknown',
      soilPh: doc.soil?.ph ?? null,
      irrigation: doc.irrigation ?? 'unknown',
      harvestMonth: doc.harvestMonth ?? null,
      nextPlantingMonth: doc.nextPlantingMonth ?? null,
      seasonsPerYear: doc.seasonsPerYear ?? null,
      waterlogging: doc.waterlogging ?? 'unknown',
      inputLevel: doc.inputLevel ?? 'unknown',
      excludedCrops: doc.excludedCrops ?? [],
      areaHectares: doc.areaHectares ?? null,
    },
    polygon: doc.polygon?.coordinates?.length ? { type: 'Polygon', coordinates: doc.polygon.coordinates } : null,
    priorities: {
      water: doc.priorities.water,
      soilHealth: doc.priorities.soilHealth,
      risk: doc.priorities.risk,
      income: doc.priorities.income,
      idleLand: doc.priorities.idleLand ?? 0,
      foodSecurity: doc.priorities.foodSecurity ?? 0,
    },
    constraints: (doc.constraints ?? []).map((c: any) => ({ type: c.type, cropId: c.cropId ?? null, note: c.note ?? null })),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
  };
}

function checkReferences(regionId: string | undefined, crops: string[]) {
  if (regionId && regionId !== CUSTOM_REGION_ID && !referenceData.getRegion(regionId)) throw new AppError(422, 'REGION_NOT_SUPPORTED', `Unknown region "${regionId}".`);
  // Farmers may grow crops that are not in the catalogue: any valid slug is accepted (the schema validates the format).
  void crops;
}

/** Region id used for farms anywhere in the world outside the prepared demo regions. */
export const CUSTOM_REGION_ID = 'custom';

const guestExpiry = () => new Date(Date.now() + env.GUEST_DATA_TTL_DAYS * 24 * 60 * 60 * 1000);

/** Every query is scoped by ownerKey — other people's fields are indistinguishable from missing ones. */
async function findOwned(req: Request) {
  const id = String(req.params.id);
  if (!isValidObjectId(id) || !req.identity) throw notFound('Field');
  const doc = await Field.findOne({ _id: id, ownerKey: req.identity.ownerKey });
  if (!doc) throw notFound('Field');
  return doc;
}

export async function listFields(req: Request, res: Response) {
  if (!req.identity) return res.json({ fields: [] });
  const docs = await Field.find({ ownerKey: req.identity.ownerKey }).sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ fields: docs.map(toFieldRecord) });
}

export async function createField(req: Request, res: Response) {
  const input = FieldInputSchema.parse(req.body);
  checkReferences(input.regionId, [input.field.currentCrop, ...input.field.cropHistory]);
  const id = req.identity!;
  const count = await Field.countDocuments({ ownerKey: id.ownerKey });
  if (count >= 100) throw new AppError(409, 'CONFLICT', 'You have reached the limit of 100 saved fields.');
  const doc = await Field.create({
    ownerKey: id.ownerKey,
    ownerType: id.ownerType,
    farmName: input.farmName,
    regionId: input.regionId,
    location: { type: 'Point', coordinates: [input.field.longitude, input.field.latitude] },
    polygon: input.polygon ?? undefined,
    currentCrop: input.field.currentCrop,
    cropHistory: input.field.cropHistory,
    soil: { type: input.field.soilType, ph: input.field.soilPh ?? null },
    irrigation: input.field.irrigation,
    harvestMonth: input.field.harvestMonth ?? null,
    nextPlantingMonth: input.field.nextPlantingMonth ?? null,
    seasonsPerYear: input.field.seasonsPerYear ?? null,
    waterlogging: input.field.waterlogging,
    inputLevel: input.field.inputLevel,
    excludedCrops: input.field.excludedCrops,
    areaHectares: input.field.areaHectares ?? null,
    priorities: input.priorities,
    constraints: input.constraints,
    expiresAt: id.ownerType === 'guest' ? guestExpiry() : null,
  });
  res.status(201).json({ field: toFieldRecord(doc) });
}

export async function getField(req: Request, res: Response) {
  const doc = await findOwned(req);
  res.json({ field: toFieldRecord(doc) });
}

export async function updateField(req: Request, res: Response) {
  const patch = FieldUpdateSchema.parse(req.body);
  const doc = await findOwned(req);
  checkReferences(undefined, [patch.field?.currentCrop, ...(patch.field?.cropHistory ?? [])].filter((x): x is string => !!x));
  if (patch.farmName) doc.farmName = patch.farmName;
  if (patch.field) {
    const f = patch.field;
    if (f.latitude != null || f.longitude != null) {
      doc.location = { type: 'Point', coordinates: [f.longitude ?? doc.location!.coordinates[0], f.latitude ?? doc.location!.coordinates[1]] } as any;
    }
    if (f.currentCrop) doc.currentCrop = f.currentCrop;
    if (f.cropHistory) doc.set('cropHistory', f.cropHistory);
    if (f.soilType) doc.set('soil.type', f.soilType);
    if (f.soilPh !== undefined) doc.set('soil.ph', f.soilPh);
    if (f.irrigation) doc.irrigation = f.irrigation;
    if (f.areaHectares !== undefined) doc.areaHectares = f.areaHectares ?? null;
    for (const k of ['harvestMonth', 'nextPlantingMonth', 'seasonsPerYear', 'waterlogging', 'inputLevel', 'excludedCrops'] as const) {
      if (f[k] !== undefined) doc.set(k, f[k] ?? null);
    }
  }
  if (patch.priorities) for (const [k, v] of Object.entries(patch.priorities)) if (v != null) doc.set(`priorities.${k}`, v);
  if (patch.constraints) doc.set('constraints', patch.constraints);
  if (patch.polygon !== undefined) doc.set('polygon', patch.polygon ?? undefined);
  if (doc.ownerType === 'guest') doc.expiresAt = guestExpiry();
  await doc.save();
  res.json({ field: toFieldRecord(doc) });
}

export async function deleteField(req: Request, res: Response) {
  const doc = await findOwned(req);
  await doc.deleteOne();
  res.status(204).end();
}
