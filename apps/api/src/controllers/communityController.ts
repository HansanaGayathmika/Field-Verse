import type { Request, Response } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import {
  COMMUNITY_CATEGORY_LABELS,
  CommunityCategorySchema,
  ExperienceInputSchema,
  ExperienceUpdateSchema,
  FeedQuerySchema,
  ModerationUpdateSchema,
  ReportInputSchema,
} from '@fieldverse/contracts';
import { env } from '../config/env';
import { CommunityExperience, CommunityReaction, CommunityReport } from '../models/Community';
import { resolveAdminArea } from '../services/geocode';
import {
  getFeed,
  getRelated,
  initialStatus,
  listAreas,
  moderationQueue,
  privacyCheck,
  signArea,
  toMyExperience,
  toPublicExperience,
  toPublicLocation,
  verifyArea,
} from '../services/community';
import { AppError, notFound } from '../utils/errors';

/* Every error here is generic and never echoes owner or reporter identity. */
const notFoundExp = () => notFound('Experience');
const viewerId = (req: Request) => req.identity?.userId ?? null;
const oid = (id: string) => (isValidObjectId(id) ? new Types.ObjectId(id) : null);

/* ------------------------------ Public ------------------------------ */
export async function feed(req: Request, res: Response) {
  const q = FeedQuerySchema.parse(req.query);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await getFeed(q, viewerId(req)));
}

export async function getExperience(req: Request, res: Response) {
  const id = oid(String(req.params.id));
  if (!id) throw notFoundExp();
  const d = await CommunityExperience.findOne({ _id: id, moderationStatus: 'published' }).lean();
  if (!d) throw notFoundExp();
  const uid = viewerId(req);
  const marked = uid ? !!(await CommunityReaction.exists({ experienceId: id, userId: uid })) : false;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ experience: toPublicExperience(d, { viewerMarkedHelpful: marked }) });
}

export async function related(req: Request, res: Response) {
  const id = oid(String(req.params.id));
  if (!id) throw notFoundExp();
  res.json({ items: await getRelated(String(id), viewerId(req)) });
}

export async function locations(_req: Request, res: Response) {
  res.json({ areas: await listAreas() });
}

const ResolveQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });
/** Coarse administrative area for a location. The coordinates are not stored or returned. */
export async function resolveLocation(req: Request, res: Response) {
  const p = ResolveQuery.safeParse(req.query);
  if (!p.success) throw new AppError(400, 'VALIDATION_ERROR', 'Query parameters "lat" and "lon" are required.');
  const r = await resolveAdminArea(p.data.lat, p.data.lon);
  // The signed token must not outlive the server's signing key, so the browser never reuses an old answer
  // (the place lookup itself is cached on the server).
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ...r, areaToken: signArea(r.area) });
}

export async function categories(_req: Request, res: Response) {
  const counts = await CommunityExperience.aggregate<{ _id: string; n: number }>([{ $match: { moderationStatus: 'published' } }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
  res.json({
    categories: CommunityCategorySchema.options.map((id) => ({ id, label: COMMUNITY_CATEGORY_LABELS[id], count: counts.find((c) => c._id === id)?.n ?? 0 })),
  });
}

/* ------------------------------ Owner ------------------------------ */
export async function createExperience(req: Request, res: Response) {
  const input = ExperienceInputSchema.parse(req.body);
  if (!verifyArea(input.area, input.areaToken)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please choose the location again — it could not be confirmed.');
  }
  privacyCheck([input.title, input.description, input.lessonsLearned, input.season, input.soilNotes, input.weatherNotes], input.acknowledgePrivacyWarnings);
  const ownerId = new Types.ObjectId(req.identity!.userId!);

  // Simple spam limits: few posts waiting for review, and no identical repeats.
  const waiting = await CommunityExperience.countDocuments({ ownerId, moderationStatus: 'pending' });
  if (waiting >= 5) throw new AppError(429, 'RATE_LIMITED', 'You have 5 experiences waiting for review. Please wait until they are reviewed before sharing more.');
  const duplicate = await CommunityExperience.exists({ ownerId, description: input.description, createdAt: { $gt: new Date(Date.now() - 86400_000) } });
  if (duplicate) throw new AppError(409, 'CONFLICT', 'You already shared this experience today.');

  // Explicit field mapping (no mass assignment). Coordinates are never part of the input.
  const d = await CommunityExperience.create({
    ownerId,
    publicLocation: toPublicLocation(input.area, input.visibilityLevel),
    cropId: input.cropId,
    category: input.category,
    title: input.title,
    description: input.description,
    lessonsLearned: input.lessonsLearned,
    season: input.season,
    approximateYear: input.approximateYear,
    irrigationMethod: input.irrigationMethod,
    soilNotes: input.soilNotes,
    weatherNotes: input.weatherNotes,
    moderationStatus: initialStatus(),
  });
  res.status(201).json({ experience: toMyExperience(d.toObject()) });
}

export async function myExperiences(req: Request, res: Response) {
  const docs = await CommunityExperience.find({ ownerId: req.identity!.userId }).sort({ createdAt: -1 }).limit(200).lean();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ items: docs.map(toMyExperience) });
}

async function findOwn(req: Request) {
  const id = oid(String(req.params.id));
  if (!id) throw notFoundExp();
  // Ownership is part of the query: other people's posts look exactly like missing ones.
  const d = await CommunityExperience.findOne({ _id: id, ownerId: req.identity!.userId });
  if (!d) throw notFoundExp();
  return d;
}

export async function updateExperience(req: Request, res: Response) {
  const patch = ExperienceUpdateSchema.parse(req.body);
  const d = await findOwn(req);
  if (d.moderationStatus === 'removed') throw new AppError(409, 'CONFLICT', 'This experience was removed by a moderator and cannot be edited.');
  privacyCheck([patch.title, patch.description, patch.lessonsLearned, patch.season, patch.soilNotes, patch.weatherNotes], patch.acknowledgePrivacyWarnings ?? false);

  if (patch.area || patch.visibilityLevel || patch.areaToken) {
    if (patch.area && patch.areaToken) {
      if (!verifyArea(patch.area, patch.areaToken)) throw new AppError(400, 'VALIDATION_ERROR', 'Please choose the location again — it could not be confirmed.');
      d.set('publicLocation', toPublicLocation(patch.area, patch.visibilityLevel ?? d.publicLocation!.visibilityLevel));
    } else if (patch.visibilityLevel && !patch.area) {
      // Only allow making an existing location BROADER (finer details are not stored).
      const order = { admin2: 0, admin1: 1, country: 2 } as const;
      const current = d.publicLocation!.visibilityLevel as keyof typeof order;
      if (order[patch.visibilityLevel] < order[current]) throw new AppError(400, 'VALIDATION_ERROR', 'To share a more specific area, please choose the location again.');
      const l = d.publicLocation!;
      d.set(
        'publicLocation',
        toPublicLocation({ countryCode: l.countryCode, countryName: l.countryName, admin1Code: l.admin1Code ?? null, admin1Name: l.admin1Name ?? null, admin2Code: l.admin2Code ?? null, admin2Name: l.admin2Name ?? null }, patch.visibilityLevel),
      );
    } else {
      throw new AppError(400, 'VALIDATION_ERROR', 'A new location needs both the area and its confirmation token.');
    }
  }
  for (const k of ['cropId', 'category', 'title', 'description', 'lessonsLearned', 'season', 'approximateYear', 'irrigationMethod', 'soilNotes', 'weatherNotes'] as const) {
    if (patch[k] !== undefined) d.set(k, patch[k]);
  }
  d.edited = true;
  // Edited posts are reviewed again so content cannot be swapped after approval.
  if (env.COMMUNITY_PREMODERATION && d.moderationStatus !== 'pending') {
    d.moderationStatus = 'pending';
    d.moderationMessage = 'Edited — waiting for review again.';
  }
  await d.save();
  res.json({ experience: toMyExperience(d.toObject()) });
}

export async function deleteExperience(req: Request, res: Response) {
  const d = await findOwn(req);
  await Promise.all([CommunityReaction.deleteMany({ experienceId: d._id }), CommunityReport.deleteMany({ experienceId: d._id })]);
  await d.deleteOne();
  res.status(204).end();
}

/* ------------------------------ Helpful ------------------------------ */
async function findPublished(req: Request) {
  const id = oid(String(req.params.id));
  if (!id) throw notFoundExp();
  const d = await CommunityExperience.findOne({ _id: id, moderationStatus: 'published' }).select('ownerId helpfulCount').lean();
  if (!d) throw notFoundExp();
  return d;
}

export async function markHelpful(req: Request, res: Response) {
  const d = await findPublished(req);
  const uid = req.identity!.userId!;
  if (String(d.ownerId) === uid) throw new AppError(400, 'VALIDATION_ERROR', 'You cannot mark your own experience as helpful.');
  let created = false;
  try {
    await CommunityReaction.create({ experienceId: d._id, userId: uid, type: 'helpful' });
    created = true;
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err; // duplicate = already marked → idempotent
  }
  const updated = created
    ? await CommunityExperience.findOneAndUpdate({ _id: d._id }, { $inc: { helpfulCount: 1 } }, { new: true }).select('helpfulCount').lean()
    : await CommunityExperience.findById(d._id).select('helpfulCount').lean();
  res.json({ helpfulCount: updated?.helpfulCount ?? 0, viewerMarkedHelpful: true });
}

export async function unmarkHelpful(req: Request, res: Response) {
  const d = await findPublished(req);
  const r = await CommunityReaction.deleteOne({ experienceId: d._id, userId: req.identity!.userId, type: 'helpful' });
  if (r.deletedCount) await CommunityExperience.updateOne({ _id: d._id, helpfulCount: { $gt: 0 } }, { $inc: { helpfulCount: -1 } });
  const updated = await CommunityExperience.findById(d._id).select('helpfulCount').lean();
  res.json({ helpfulCount: updated?.helpfulCount ?? 0, viewerMarkedHelpful: false });
}

/* ------------------------------ Reports ------------------------------ */
export async function report(req: Request, res: Response) {
  const input = ReportInputSchema.parse(req.body);
  const d = await findPublished(req);
  const uid = req.identity!.userId!;
  if (String(d.ownerId) === uid) throw new AppError(400, 'VALIDATION_ERROR', 'You cannot report your own experience. You can edit or delete it instead.');
  try {
    await CommunityReport.create({ experienceId: d._id, reporterId: uid, reason: input.reason, details: input.details });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'CONFLICT', 'You have already reported this experience. Thank you — a moderator will review it.');
    throw err;
  }
  const after = await CommunityExperience.findOneAndUpdate({ _id: d._id }, { $inc: { openReportCount: 1 } }, { new: true });
  // Several distinct reports hide the post until a moderator reviews it.
  if (after && after.openReportCount >= env.COMMUNITY_AUTO_HIDE_REPORTS && after.moderationStatus === 'published') {
    after.moderationStatus = 'hidden';
    after.moderationMessage = 'Hidden while a moderator reviews reports from other farmers.';
    await after.save();
  }
  res.status(201).json({ received: true });
}

/* ------------------------------ Moderation ------------------------------ */
export async function queue(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ items: await moderationQueue() });
}

export async function moderate(req: Request, res: Response) {
  const input = ModerationUpdateSchema.parse(req.body);
  const id = oid(String(req.params.id));
  if (!id) throw notFoundExp();
  const d = await CommunityExperience.findById(id);
  if (!d) throw notFoundExp();
  if (String(d.ownerId) === req.identity!.userId) throw new AppError(403, 'FORBIDDEN', 'Moderators cannot review their own experiences.');
  d.moderationStatus = input.status;
  d.moderationMessage = input.message ?? (input.status === 'published' ? null : d.moderationMessage);
  d.set('moderatedBy', new Types.ObjectId(req.identity!.userId!));
  d.moderatedAt = new Date();
  d.openReportCount = 0;
  await d.save();
  await CommunityReport.updateMany({ experienceId: d._id, status: 'open' }, { $set: { status: 'resolved' } });
  res.json({ experience: toMyExperience(d.toObject()) });
}
