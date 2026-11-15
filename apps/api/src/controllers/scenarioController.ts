import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { AnalysisModeSchema, SavedScenarioInputSchema, type SavedScenarioRecord } from '@fieldverse/contracts';
import { SavedScenario } from '../models/SavedScenario';
import { Field } from '../models/Field';
import { env } from '../config/env';
import { AppError, notFound } from '../utils/errors';

function toRecord(d: any): SavedScenarioRecord {
  return {
    id: String(d._id),
    title: d.title,
    fieldId: d.fieldId ? String(d.fieldId) : null,
    regionId: d.regionId,
    farmerInputs: d.farmerInputs,
    scenario: { rainfallChangePercent: d.scenario.rainfallChangePercent, temperatureChangeCelsius: d.scenario.temperatureChangeCelsius },
    analysis: d.analysis,
    notes: d.notes ?? null,
    mode: d.mode,
    modelVersion: d.modelVersion ?? null,
    analysisRequestId: d.analysisRequestId ?? null,
    analysisGeneratedAt: d.analysisGeneratedAt ?? null,
    sourceIds: d.sourceIds ?? [],
    createdAt: new Date(d.createdAt).toISOString(),
  };
}

export async function listScenarios(req: Request, res: Response) {
  if (!req.identity) return res.json({ scenarios: [] });
  const docs = await SavedScenario.find({ ownerKey: req.identity.ownerKey }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ scenarios: docs.map(toRecord) });
}

export async function createScenario(req: Request, res: Response) {
  const input = SavedScenarioInputSchema.parse(req.body);
  const id = req.identity!;
  if (Buffer.byteLength(JSON.stringify(input.analysis)) > 400_000) throw new AppError(413, 'VALIDATION_ERROR', 'Analysis is too large to save.');

  // Provenance is read from the analysis itself (server-side), not trusted from separate client fields.
  const a = input.analysis as Record<string, unknown>;
  const mode = AnalysisModeSchema.safeParse(a.mode);
  if (!mode.success) throw new AppError(400, 'VALIDATION_ERROR', 'analysis.mode must be "demo" or "remote".');
  const sourceIds = Array.isArray(a.dataSources) ? (a.dataSources as { id?: unknown }[]).map((s) => String(s?.id ?? '')).filter(Boolean) : [];

  if (input.fieldId) {
    if (!isValidObjectId(input.fieldId)) throw notFound('Field');
    const owns = await Field.exists({ _id: input.fieldId, ownerKey: id.ownerKey });
    if (!owns) throw notFound('Field');
  }
  const count = await SavedScenario.countDocuments({ ownerKey: id.ownerKey });
  if (count >= 200) throw new AppError(409, 'CONFLICT', 'You have reached the limit of 200 saved plans.');

  const doc = await SavedScenario.create({
    ownerKey: id.ownerKey,
    ownerType: id.ownerType,
    title: input.title,
    fieldId: input.fieldId ?? null,
    regionId: input.regionId,
    farmerInputs: input.farmerInputs,
    scenario: input.scenario,
    analysis: input.analysis,
    mode: mode.data,
    modelVersion: typeof a.modelVersion === 'string' ? a.modelVersion : null,
    analysisRequestId: typeof a.requestId === 'string' ? a.requestId : null,
    analysisGeneratedAt: typeof a.generatedAt === 'string' ? a.generatedAt : null,
    sourceIds,
    notes: input.notes ?? null,
    expiresAt: id.ownerType === 'guest' ? new Date(Date.now() + env.GUEST_DATA_TTL_DAYS * 86400000) : null,
  });
  res.status(201).json({ scenario: toRecord(doc) });
}

export async function getScenario(req: Request, res: Response) {
  const sid = String(req.params.id);
  if (!isValidObjectId(sid) || !req.identity) throw notFound('Saved plan');
  const doc = await SavedScenario.findOne({ _id: sid, ownerKey: req.identity.ownerKey }).lean();
  if (!doc) throw notFound('Saved plan');
  res.json({ scenario: toRecord(doc) });
}

export async function deleteScenario(req: Request, res: Response) {
  const sid = String(req.params.id);
  if (!isValidObjectId(sid) || !req.identity) throw notFound('Saved plan');
  const r = await SavedScenario.deleteOne({ _id: sid, ownerKey: req.identity.ownerKey });
  if (!r.deletedCount) throw notFound('Saved plan');
  res.status(204).end();
}
