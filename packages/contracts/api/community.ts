import { z } from 'zod';
import { SlugSchema } from '../analysis/common';

/**
 * FieldVerse Community — public contract.
 * Public DTOs deliberately contain NO author identity and NO coordinates.
 */

/* ------------------------------ Locations ------------------------------ */
export const VisibilityLevelSchema = z.enum(['admin2', 'admin1', 'country']);
export type VisibilityLevel = z.infer<typeof VisibilityLevelSchema>;

/**
 * Administrative area. Codes are ISO 3166-1 alpha-2 (country) and ISO 3166-2 (subdivisions)
 * where available; otherwise a deterministic derived code "<parentCode>:<slug>".
 */
export const AdminAreaSchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  countryName: z.string().min(1).max(100),
  admin1Code: z.string().max(60).nullable(),
  admin1Name: z.string().max(120).nullable(),
  admin2Code: z.string().max(140).nullable(),
  admin2Name: z.string().max(120).nullable(),
});
export type AdminArea = z.infer<typeof AdminAreaSchema>;

export const PublicLocationSchema = AdminAreaSchema.extend({ visibilityLevel: VisibilityLevelSchema });
export type PublicLocation = z.infer<typeof PublicLocationSchema>;

export const ResolvedAreaSchema = z.object({
  area: AdminAreaSchema,
  /** Country-specific names for the levels, e.g. { admin1: "Province", admin2: "District" }. */
  levelLabels: z.object({ admin1: z.string(), admin2: z.string() }),
  /** Pass back with a new experience so the server knows the area was resolved here. */
  areaToken: z.string(),
});
export type ResolvedArea = z.infer<typeof ResolvedAreaSchema>;

/* ------------------------------ Categories ------------------------------ */
export const CommunityCategorySchema = z.enum([
  'crop_cultivation',
  'crop_rotation',
  'irrigation',
  'soil_improvement',
  'pests_diseases',
  'flooding',
  'drought',
  'harvesting',
  'seeds_planting',
  'other',
]);
export type CommunityCategory = z.infer<typeof CommunityCategorySchema>;

export const COMMUNITY_CATEGORY_LABELS: Record<CommunityCategory, string> = {
  crop_cultivation: 'Crop cultivation',
  crop_rotation: 'Crop rotation',
  irrigation: 'Irrigation',
  soil_improvement: 'Soil improvement',
  pests_diseases: 'Pest and disease concerns',
  flooding: 'Flooding',
  drought: 'Drought',
  harvesting: 'Harvesting',
  seeds_planting: 'Seeds and planting',
  other: 'Other farming experience',
};

export const IrrigationMethodSchema = z.enum(['rainfed', 'tank_canal', 'well_pump', 'drip_sprinkler', 'other', 'unknown']);

/* ------------------------------ Experiences ------------------------------ */
const text = (min: number, max: number) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex -- intentionally strips control characters from user text
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().min(min, `Please write at least ${min} characters`).max(max, `Please keep this under ${max} characters`));
const optionalText = (max: number) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex -- intentionally strips control characters from user text
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .pipe(z.string().max(max, `Please keep this under ${max} characters`))
    .nullish()
    .transform((v) => (v ? v : null));

export const ExperienceFieldsSchema = z.object({
  /** The coarse area to publish (resolved from the farmer's field) and how much of it to show. */
  area: AdminAreaSchema,
  /** Signature returned by /community/locations/resolve — proves the area was resolved by the server. */
  areaToken: z.string().min(10).max(200),
  visibilityLevel: VisibilityLevelSchema,
  /** A crop id from the catalogue, a farmer-added crop slug, or null for a general topic. */
  cropId: SlugSchema.nullish().transform((v) => v ?? null),
  category: CommunityCategorySchema,
  title: optionalText(100),
  description: text(30, 2000),
  lessonsLearned: optionalText(1000),
  season: optionalText(40),
  approximateYear: z
    .number()
    .int()
    .min(1950)
    .max(new Date().getFullYear() + 1)
    .nullish()
    .transform((v) => v ?? null),
  irrigationMethod: IrrigationMethodSchema.nullish().transform((v) => v ?? null),
  soilNotes: optionalText(300),
  weatherNotes: optionalText(300),
});

export const ExperienceInputSchema = ExperienceFieldsSchema.extend({
  /** Required (true) when the text contains possible personal information (see detectPersonalInfo). */
  acknowledgePrivacyWarnings: z.boolean().default(false),
}).strict();
export type ExperienceInput = z.infer<typeof ExperienceInputSchema>;
export type ExperienceInputRaw = z.input<typeof ExperienceInputSchema>;

export const ExperienceUpdateSchema = ExperienceFieldsSchema.partial()
  .extend({ acknowledgePrivacyWarnings: z.boolean().default(false) })
  .strict();
export type ExperienceUpdate = z.infer<typeof ExperienceUpdateSchema>;

export const ModerationStatusSchema = z.enum(['pending', 'published', 'hidden', 'removed']);
export type ModerationStatus = z.infer<typeof ModerationStatusSchema>;

export const RelevanceLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

/** The ONLY shape in which an experience leaves the server publicly. No author, no coordinates. */
export const PublicExperienceSchema = z
  .object({
    id: z.string(),
    publicLocation: PublicLocationSchema,
    cropId: z.string().nullable(),
    category: CommunityCategorySchema,
    title: z.string().nullable(),
    description: z.string(),
    lessonsLearned: z.string().nullable(),
    season: z.string().nullable(),
    approximateYear: z.number().nullable(),
    irrigationMethod: IrrigationMethodSchema.nullable(),
    soilNotes: z.string().nullable(),
    weatherNotes: z.string().nullable(),
    helpfulCount: z.number().int().min(0),
    /** Date only (YYYY-MM-DD) — no exact timestamps. */
    postedOn: z.string(),
    edited: z.boolean(),
    verification: z.literal('farmer_reported'),
    /** Present for demonstration fixtures only (none are created by default). */
    isDemo: z.boolean(),
    /** Viewer-specific (never about other people). */
    viewerMarkedHelpful: z.boolean(),
    relevance: z.object({ level: RelevanceLevelSchema, reason: z.string() }).nullable(),
  })
  .strict();
export type PublicExperience = z.infer<typeof PublicExperienceSchema>;

/** The owner's own view: adds moderation status. Still no account identifiers. */
export const MyExperienceSchema = PublicExperienceSchema.omit({ relevance: true, viewerMarkedHelpful: true })
  .extend({ moderationStatus: ModerationStatusSchema, moderationMessage: z.string().nullable(), openReports: z.number().int().min(0) })
  .strict();
export type MyExperience = z.infer<typeof MyExperienceSchema>;

/* ------------------------------ Feed ------------------------------ */
export const FeedScopeSchema = z.enum(['admin2', 'admin1', 'country', 'world', 'auto']);
export const FeedSortSchema = z.enum(['relevant', 'recent', 'helpful']);

export const FeedQuerySchema = z.object({
  countryCode: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase())
    .optional(),
  admin1Code: z.string().max(60).optional(),
  admin2Code: z.string().max(140).optional(),
  /** auto = district → province → country, adding other countries only if local results are few. */
  scope: FeedScopeSchema.default('auto'),
  cropId: SlugSchema.optional(),
  category: CommunityCategorySchema.optional(),
  /** Soft preference: experiences about this crop rank higher within the same area level. */
  preferCrop: SlugSchema.optional(),
  q: z.string().trim().max(100).optional(),
  sort: FeedSortSchema.default('relevant'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FeedResponseSchema = z.object({
  items: z.array(PublicExperienceSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  hasMore: z.boolean(),
  /** How many matching experiences exist at each geographic level (after filters). */
  levelCounts: z.object({ admin2: z.number(), admin1: z.number(), country: z.number(), world: z.number() }),
  includedOtherCountries: z.boolean(),
  explanation: z.string(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;

/* ------------------------------ Reports & moderation ------------------------------ */
export const ReportReasonSchema = z.enum(['spam', 'misleading', 'abusive', 'personal_info', 'inappropriate_image', 'other']);
export const REPORT_REASON_LABELS: Record<z.infer<typeof ReportReasonSchema>, string> = {
  spam: 'Spam',
  misleading: 'Misleading agricultural claims',
  abusive: 'Abusive language',
  personal_info: 'Personal information exposure',
  inappropriate_image: 'Inappropriate image',
  other: 'Other concern',
};
export const ReportInputSchema = z.object({ reason: ReportReasonSchema, details: optionalText(500) }).strict();
export type ReportInput = z.infer<typeof ReportInputSchema>;

export const ModerationUpdateSchema = z
  .object({ status: z.enum(['published', 'hidden', 'removed']), message: optionalText(300) })
  .strict();

export const ModerationItemSchema = MyExperienceSchema.extend({
  reports: z.array(z.object({ reason: ReportReasonSchema, details: z.string().nullable(), reportedOn: z.string() })),
}).strict();
export type ModerationItem = z.infer<typeof ModerationItemSchema>;

export const CommunityAreaSummarySchema = z.object({
  level: VisibilityLevelSchema,
  countryCode: z.string(),
  countryName: z.string(),
  admin1Code: z.string().nullable(),
  admin1Name: z.string().nullable(),
  admin2Code: z.string().nullable(),
  admin2Name: z.string().nullable(),
  count: z.number(),
});
export type CommunityAreaSummary = z.infer<typeof CommunityAreaSummarySchema>;

/* ------------------------------ Privacy check ------------------------------ */
export type PersonalInfoWarning = { type: 'email' | 'phone' | 'url' | 'address' | 'coordinates' | 'social_handle'; match: string };

/**
 * Best-effort detection of obvious personal information in free text. It is a helper,
 * NOT a guarantee of anonymity — the UI says so.
 */
export function detectPersonalInfo(input: string): PersonalInfoWarning[] {
  const text = input ?? '';
  const out: PersonalInfoWarning[] = [];
  const push = (type: PersonalInfoWarning['type'], re: RegExp) => {
    for (const m of text.matchAll(re)) out.push({ type, match: m[0].trim() });
  };
  push('email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
  push('url', /\b(?:https?:\/\/|www\.)\S+/gi);
  // Phone numbers: 9+ digits, optionally with +, spaces, dashes, dots or brackets.
  push('phone', /(?:\+?\d[\d\s().-]{7,}\d)/g);
  push('coordinates', /-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g);
  push('social_handle', /(?:^|\s)@[A-Za-z0-9_]{3,}/g);
  // House numbers followed by a street word (English, Sinhala/Tamil transliterations, Swahili, Portuguese).
  push('address', /\b\d{1,5}[A-Za-z]?\s*,?\s+[A-Za-z][A-Za-z.' -]{1,40}\s(?:road|rd|street|st|lane|ln|avenue|ave|mawatha|veediya|barabara|rua|avenida|estrada)\b/gi);
  push('address', /\b(?:house|home|plot|no\.?)\s*(?:no\.?|number)?\s*\d{1,5}\b/gi);
  // De-duplicate overlapping phone/coordinate matches.
  return out.filter((w, i) => out.findIndex((x) => x.match === w.match) === i);
}
