import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Types, type PipelineStage } from 'mongoose';
import {
  COMMUNITY_CATEGORY_LABELS,
  detectPersonalInfo,
  type AdminArea,
  type CommunityAreaSummary,
  type FeedQuery,
  type FeedResponse,
  type ModerationItem,
  type MyExperience,
  type PublicExperience,
  type PublicLocation,
  type VisibilityLevel,
} from '@fieldverse/contracts';
import { env } from '../config/env';
import { CommunityExperience, CommunityReaction, CommunityReport } from '../models/Community';
import { referenceData } from './referenceData';
import { AppError } from '../utils/errors';

/* ------------------------------------------------------------------ */
/* Area tokens: posts may only use areas resolved by THIS server.     */
/* ------------------------------------------------------------------ */
const AREA_SECRET = process.env.COMMUNITY_AREA_SECRET || randomBytes(32).toString('hex');

const canonicalArea = (a: AdminArea) =>
  JSON.stringify([a.countryCode, a.countryName, a.admin1Code ?? null, a.admin1Name ?? null, a.admin2Code ?? null, a.admin2Name ?? null]);

export function signArea(a: AdminArea) {
  return createHmac('sha256', AREA_SECRET).update(canonicalArea(a)).digest('base64url');
}

export function verifyArea(a: AdminArea, token: string | undefined) {
  if (!token) return false;
  const expected = Buffer.from(signArea(a));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Keep ONLY the level the farmer chose to publish — finer details are not even stored. */
export function toPublicLocation(a: AdminArea, level: VisibilityLevel): PublicLocation {
  if (level === 'admin2' && !a.admin2Code) throw new AppError(400, 'VALIDATION_ERROR', 'This location has no district-level area. Please share at a broader level.');
  if (level === 'admin1' && !a.admin1Code) throw new AppError(400, 'VALIDATION_ERROR', 'This location has no province-level area. Please share at country level.');
  return {
    countryCode: a.countryCode,
    countryName: a.countryName,
    admin1Code: level === 'country' ? null : a.admin1Code,
    admin1Name: level === 'country' ? null : a.admin1Name,
    admin2Code: level === 'admin2' ? a.admin2Code : null,
    admin2Name: level === 'admin2' ? a.admin2Name : null,
    visibilityLevel: level,
  };
}

/* ------------------------------------------------------------------ */
/* DTOs — explicit allow-lists. Never spread a Mongoose document.      */
/* ------------------------------------------------------------------ */
type Doc = Record<string, any>;

const location = (l: Doc): PublicLocation => ({
  countryCode: l.countryCode,
  countryName: l.countryName,
  admin1Code: l.admin1Code ?? null,
  admin1Name: l.admin1Name ?? null,
  admin2Code: l.admin2Code ?? null,
  admin2Name: l.admin2Name ?? null,
  visibilityLevel: l.visibilityLevel,
});

function baseFields(d: Doc) {
  return {
    id: String(d._id),
    publicLocation: location(d.publicLocation),
    cropId: d.cropId ?? null,
    category: d.category,
    title: d.title ?? null,
    description: d.description,
    lessonsLearned: d.lessonsLearned ?? null,
    season: d.season ?? null,
    approximateYear: d.approximateYear ?? null,
    irrigationMethod: d.irrigationMethod ?? null,
    soilNotes: d.soilNotes ?? null,
    weatherNotes: d.weatherNotes ?? null,
    helpfulCount: Math.max(0, d.helpfulCount ?? 0),
    postedOn: new Date(d.createdAt).toISOString().slice(0, 10),
    edited: !!d.edited,
    verification: 'farmer_reported' as const,
    isDemo: !!d.isDemo,
  };
}

export function toPublicExperience(d: Doc, extra: { viewerMarkedHelpful?: boolean; relevance?: PublicExperience['relevance'] } = {}): PublicExperience {
  return { ...baseFields(d), viewerMarkedHelpful: !!extra.viewerMarkedHelpful, relevance: extra.relevance ?? null };
}

export function toMyExperience(d: Doc): MyExperience {
  return { ...baseFields(d), moderationStatus: d.moderationStatus, moderationMessage: d.moderationMessage ?? null, openReports: d.openReportCount ?? 0 };
}

/* ------------------------------------------------------------------ */
/* Feed: deterministic geographic relevance (no ML).                   */
/* ------------------------------------------------------------------ */
const AUTO_MIN_LOCAL = 5;

export function relevanceReason(level: number, l: Doc) {
  if (level === 1) return `Shared in ${l.admin2Name}`;
  if (level === 2) return `Elsewhere in ${l.admin1Name ?? l.countryName}`;
  if (level === 3) return `Elsewhere in ${l.countryName}`;
  return `From ${l.countryName}`;
}

export async function getFeed(q: FeedQuery, viewerUserId: string | null): Promise<FeedResponse> {
  const match: Record<string, unknown> = { moderationStatus: 'published' };
  if (q.cropId) match.cropId = q.cropId;
  if (q.category) match.category = q.category;
  if (q.q) match.$text = { $search: q.q };
  const hasCountry = !!q.countryCode;

  // Level 1 = same district, 2 = same province/state, 3 = same country, 4 = elsewhere.
  const levelExpr = {
    $switch: {
      branches: [
        ...(q.admin2Code ? [{ case: { $eq: ['$publicLocation.admin2Code', q.admin2Code] }, then: 1 }] : []),
        ...(q.admin1Code ? [{ case: { $eq: ['$publicLocation.admin1Code', q.admin1Code] }, then: 2 }] : []),
        ...(q.countryCode ? [{ case: { $eq: ['$publicLocation.countryCode', q.countryCode] }, then: 3 }] : []),
      ],
      default: 4,
    },
  };

  const base: PipelineStage[] = [{ $match: match }, { $addFields: { _level: q.admin2Code || q.admin1Code || q.countryCode ? levelExpr : 4 } }];
  const countsAgg = await CommunityExperience.aggregate<{ _id: number; n: number }>([...base, { $group: { _id: '$_level', n: { $sum: 1 } } }]);
  const byLevel = (l: number) => countsAgg.find((c) => c._id === l)?.n ?? 0;
  const levelCounts = {
    admin2: byLevel(1),
    admin1: byLevel(1) + byLevel(2),
    country: byLevel(1) + byLevel(2) + byLevel(3),
    world: byLevel(1) + byLevel(2) + byLevel(3) + byLevel(4),
  };

  let maxLevel = 4;
  let includedOtherCountries = true;
  let explanation: string;
  if (!hasCountry) {
    explanation = 'No location chosen, so experiences from every country are shown, newest first. Choose your location to see nearby experiences first.';
  } else if (q.scope === 'admin2') {
    maxLevel = 1;
    includedOtherCountries = false;
    explanation = 'Showing experiences from your district only.';
  } else if (q.scope === 'admin1') {
    maxLevel = 2;
    includedOtherCountries = false;
    explanation = 'Showing experiences from your district first, then the rest of your province or region.';
  } else if (q.scope === 'country') {
    maxLevel = 3;
    includedOtherCountries = false;
    explanation = 'Showing experiences from your district first, then your province or region, then the rest of your country.';
  } else if (q.scope === 'world') {
    explanation = 'Showing nearby experiences first, then other countries.';
  } else {
    // auto: other countries only when local results are few.
    includedOtherCountries = levelCounts.country < AUTO_MIN_LOCAL;
    maxLevel = includedOtherCountries ? 4 : 3;
    explanation = includedOtherCountries
      ? `Nearby first: your district, then your province or region, then your country. Because fewer than ${AUTO_MIN_LOCAL} experiences were found in your country, experiences from other countries are also shown.`
      : 'Nearby first: your district, then your province or region, then the rest of your country. Choose "Other countries" to see more.';
  }

  const sort: Record<string, 1 | -1 | { $meta: 'textScore' }> = {};
  if (q.sort === 'relevant') {
    sort._level = 1;
    if (q.preferCrop) sort._cropMatch = -1;
    if (q.q) sort._score = { $meta: 'textScore' };
    sort.createdAt = -1;
  } else if (q.sort === 'helpful') {
    sort.helpfulCount = -1;
    sort.createdAt = -1;
  } else {
    sort.createdAt = -1;
  }
  sort._id = -1;

  const total = maxLevel === 4 ? levelCounts.world : maxLevel === 3 ? levelCounts.country : maxLevel === 2 ? levelCounts.admin1 : levelCounts.admin2;
  const docs = await CommunityExperience.aggregate([
    ...base,
    { $match: { _level: { $lte: maxLevel } } },
    ...(q.preferCrop ? [{ $addFields: { _cropMatch: { $cond: [{ $eq: ['$cropId', q.preferCrop] }, 1, 0] } } }] : []),
    ...(q.q ? [{ $addFields: { _score: { $meta: 'textScore' } } }] : []),
    { $sort: sort },
    { $skip: (q.page - 1) * q.pageSize },
    { $limit: q.pageSize },
  ] as PipelineStage[]);

  const helpfulSet = new Set<string>();
  if (viewerUserId && docs.length) {
    const reacted = await CommunityReaction.find({ userId: viewerUserId, experienceId: { $in: docs.map((d) => d._id) } })
      .select('experienceId')
      .lean();
    reacted.forEach((r) => helpfulSet.add(String(r.experienceId)));
  }

  return {
    items: docs.map((d) =>
      toPublicExperience(d, {
        viewerMarkedHelpful: helpfulSet.has(String(d._id)),
        relevance: hasCountry ? { level: d._level, reason: relevanceReason(d._level, d.publicLocation) } : null,
      }),
    ),
    page: q.page,
    pageSize: q.pageSize,
    total,
    hasMore: q.page * q.pageSize < total,
    levelCounts,
    includedOtherCountries,
    explanation,
  };
}

/* ------------------------------------------------------------------ */
export async function getRelated(id: string, viewerUserId: string | null): Promise<PublicExperience[]> {
  const doc = await CommunityExperience.findOne({ _id: id, moderationStatus: 'published' }).lean();
  if (!doc) return [];
  const l = doc.publicLocation;
  const picked = new Map<string, { d: Doc; reason: string }>();
  const take = async (filter: Record<string, unknown>, reason: (d: Doc) => string, limit: number) => {
    if (picked.size >= 4) return;
    const rows = await CommunityExperience.find({ ...filter, moderationStatus: 'published', _id: { $nin: [doc._id, ...[...picked.keys()].map((k) => new Types.ObjectId(k))] } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    for (const r of rows) if (picked.size < 4) picked.set(String(r._id), { d: r, reason: reason(r) });
  };
  const cropName = (c: string | null) => (c ? (referenceData.getCrop(c)?.names.en ?? c.replace(/-/g, ' ')) : null);
  const placeOf = (d: Doc) => d.publicLocation.admin2Name ?? d.publicLocation.admin1Name ?? d.publicLocation.countryName;
  if (l.admin2Code) await take({ 'publicLocation.admin2Code': l.admin2Code }, (d) => `Also shared in ${placeOf(d)}`, 2);
  if (l.admin1Code) await take({ 'publicLocation.admin1Code': l.admin1Code }, (d) => `Also shared in ${placeOf(d)}`, 2);
  await take({ 'publicLocation.countryCode': l.countryCode }, () => `Another experience from ${l.countryName}`, 2);
  if (doc.cropId) await take({ cropId: doc.cropId }, () => `Another experience about ${cropName(doc.cropId ?? null)?.toLowerCase()}`, 2);
  await take({ category: doc.category }, () => `Another experience about ${COMMUNITY_CATEGORY_LABELS[doc.category as keyof typeof COMMUNITY_CATEGORY_LABELS].toLowerCase()}`, 2);

  const ids = [...picked.keys()];
  const helpful = viewerUserId ? new Set((await CommunityReaction.find({ userId: viewerUserId, experienceId: { $in: ids } }).lean()).map((r) => String(r.experienceId))) : new Set<string>();
  return [...picked.values()].map(({ d, reason }) => toPublicExperience(d, { viewerMarkedHelpful: helpful.has(String(d._id)), relevance: { level: 1, reason } }));
}

/* ------------------------------------------------------------------ */
export async function listAreas(): Promise<CommunityAreaSummary[]> {
  const rows = await CommunityExperience.aggregate([
    { $match: { moderationStatus: 'published' } },
    {
      $group: {
        _id: { c: '$publicLocation.countryCode', a1: '$publicLocation.admin1Code', a2: '$publicLocation.admin2Code' },
        countryName: { $first: '$publicLocation.countryName' },
        admin1Name: { $first: '$publicLocation.admin1Name' },
        admin2Name: { $first: '$publicLocation.admin2Name' },
        level: { $first: '$publicLocation.visibilityLevel' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 300 },
  ]);
  return rows.map((r) => ({
    level: r._id.a2 ? 'admin2' : r._id.a1 ? 'admin1' : 'country',
    countryCode: r._id.c,
    countryName: r.countryName,
    admin1Code: r._id.a1 ?? null,
    admin1Name: r.admin1Name ?? null,
    admin2Code: r._id.a2 ?? null,
    admin2Name: r.admin2Name ?? null,
    count: r.count,
  }));
}

/* ------------------------------------------------------------------ */
/* Privacy check on free text.                                         */
/* ------------------------------------------------------------------ */
export function privacyCheck(fields: (string | null | undefined)[], acknowledged: boolean) {
  const warnings = fields.flatMap((f) => (f ? detectPersonalInfo(f) : []));
  if (warnings.length && !acknowledged) {
    throw new AppError(422, 'PRIVACY_CHECK_REQUIRED', 'Your text may contain personal information (such as a phone number, email or address). Please remove it, or confirm that you want to publish it.', {
      warnings: warnings.map((w) => ({ type: w.type })),
    });
  }
}

export const initialStatus = () => (env.COMMUNITY_PREMODERATION ? 'pending' : 'published');

/* ------------------------------------------------------------------ */
export async function moderationQueue(): Promise<ModerationItem[]> {
  const docs = await CommunityExperience.find({ $or: [{ moderationStatus: { $in: ['pending', 'hidden'] } }, { openReportCount: { $gt: 0 } }] })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
  const reports = await CommunityReport.find({ experienceId: { $in: docs.map((d) => d._id) }, status: 'open' }).lean();
  return docs.map((d) => ({
    ...toMyExperience(d),
    // Reports never include who reported.
    reports: reports
      .filter((r) => String(r.experienceId) === String(d._id))
      .map((r) => ({ reason: r.reason as ModerationItem['reports'][number]['reason'], details: r.details ?? null, reportedOn: new Date(r.createdAt as Date).toISOString().slice(0, 10) })),
  }));
}

/** When an account is deleted, its community content and reactions go with it. */
export async function deleteUserCommunityData(userId: Types.ObjectId | string) {
  const uid = new Types.ObjectId(String(userId));
  const own = await CommunityExperience.find({ ownerId: uid }).select('_id').lean();
  const ownIds = own.map((d) => d._id);
  await CommunityReaction.deleteMany({ experienceId: { $in: ownIds } });
  await CommunityReport.deleteMany({ experienceId: { $in: ownIds } });
  await CommunityExperience.deleteMany({ ownerId: uid });
  const reactions = await CommunityReaction.find({ userId: uid }).lean();
  for (const r of reactions) await CommunityExperience.updateOne({ _id: r.experienceId, helpfulCount: { $gt: 0 } }, { $inc: { helpfulCount: -1 } });
  await CommunityReaction.deleteMany({ userId: uid });
  await CommunityReport.deleteMany({ reporterId: uid });
}
