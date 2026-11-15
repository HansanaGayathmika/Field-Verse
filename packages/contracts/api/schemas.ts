import { z } from 'zod';
import { AnalysisModeSchema, SlugSchema, SourceRefSchema, SourceTypeSchema } from '../analysis/common';
import { EnvironmentSummarySchema } from '../analysis/environment';
import {
  FarmerConstraintSchema,
  FieldProfileSchema,
  IrrigationSchema,
  PrioritiesSchema,
  ScenarioAssumptionsSchema,
  SoilTypeSchema,
} from '../analysis/requests';
import { ScenarioPresetSchema } from '../analysis/responses';

/* ------------------------------ Errors ------------------------------ */
export const ApiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'RATE_LIMITED',
  'CSRF_REJECTED',
  'PRIVACY_CHECK_REQUIRED',
  'DATABASE_UNAVAILABLE',
  'REGION_NOT_SUPPORTED',
  'CROP_NOT_SUPPORTED',
  'SCENARIO_NOT_SUPPORTED',
  'DATA_UNAVAILABLE',
  'ANALYSIS_UNAVAILABLE',
  'ANALYSIS_TIMEOUT',
  'ANALYSIS_BAD_RESPONSE',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/* ------------------------------ Regions ------------------------------ */
export const SeasonInfoSchema = z.object({
  name: z.string(),
  months: z.array(z.number().int().min(1).max(12)),
  description: z.string(),
});

export const RegionSchema = z.object({
  id: SlugSchema,
  name: z.string(),
  shortName: z.string(),
  country: z.string(),
  countryCode: z.string().length(2),
  latitude: z.number(),
  longitude: z.number(),
  elevationNote: z.string().nullish(),
  agroEcologicalZone: z.string().nullish(),
  tagline: z.string(),
  description: z.string(),
  farmingContext: z.array(z.string()),
  seasons: z.array(SeasonInfoSchema),
  supportedCrops: z.array(SlugSchema),
  commonCrops: z.array(SlugSchema),
  demoFarm: z.object({
    farmName: z.string(),
    currentCrop: SlugSchema,
    cropHistory: z.array(SlugSchema),
    soilType: SoilTypeSchema,
    irrigation: IrrigationSchema,
    harvestMonth: z.number().int().min(1).max(12).nullish(),
    nextPlantingMonth: z.number().int().min(1).max(12).nullish(),
    seasonsPerYear: z.number().int().min(1).max(3).nullish(),
  }),
  dataStatus: z.object({
    climate: SourceTypeSchema,
    soil: SourceTypeSchema,
    vegetation: SourceTypeSchema,
    rotations: SourceTypeSchema,
    scenarios: SourceTypeSchema,
  }),
  contentSource: z.object({ sourceType: SourceTypeSchema, note: z.string() }),
  media: z.object({ poster: z.string().nullish() }).nullish(),
  supportRadiusKm: z.number().positive(),
});
export type Region = z.infer<typeof RegionSchema>;

/* ------------------------------ Crops ------------------------------ */
export const CropSchema = z.object({
  id: SlugSchema,
  names: z.object({ en: z.string() }).catchall(z.string()),
  scientificName: z.string().nullable(),
  family: z.string().nullable(),
  category: z.enum(['cereal', 'legume', 'cover', 'root']),
  image: z.object({ src: z.string(), alt: z.string(), credit: z.string() }),
  description: z.string(),
  roles: z.array(z.enum(['main', 'short_season', 'cover'])),
  characteristics: z.object({
    durationDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
    waterNeed: z.enum(['low', 'medium', 'high', 'unknown']),
    droughtTolerance: z.enum(['low', 'medium', 'high', 'unknown']),
    waterloggingTolerance: z.enum(['low', 'medium', 'high', 'unknown']),
    nitrogenFixing: z.boolean(),
    rootSystem: z.enum(['fibrous', 'taproot']),
  }),
  regions: z.array(SlugSchema),
  source: z.object({ sourceType: SourceTypeSchema, name: z.string(), note: z.string() }),
});
export type Crop = z.infer<typeof CropSchema>;

/* ------------------------------ Observations ------------------------------ */
export const ObservationsResponseSchema = z.object({
  regionId: SlugSchema,
  environment: EnvironmentSummarySchema,
  dataSources: z.array(SourceRefSchema),
  preparedAt: z.string().nullish(),
});
export type ObservationsResponse = z.infer<typeof ObservationsResponseSchema>;

/* ------------------------------ Fields ------------------------------ */
export const GeoPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(4)).min(1),
});

export const FieldInputSchema = z.object({
  farmName: z.string().trim().min(1).max(80),
  regionId: SlugSchema,
  field: FieldProfileSchema,
  polygon: GeoPolygonSchema.nullish(),
  priorities: PrioritiesSchema,
  constraints: z.array(FarmerConstraintSchema).max(12).default([]),
});
export type FieldInput = z.infer<typeof FieldInputSchema>;
export type FieldInputRaw = z.input<typeof FieldInputSchema>;

export const FieldUpdateSchema = z
  .object({
    farmName: z.string().trim().min(1).max(80),
    field: FieldProfileSchema.partial(),
    polygon: GeoPolygonSchema.nullish(),
    priorities: PrioritiesSchema.partial(),
    constraints: z.array(FarmerConstraintSchema).max(12),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type FieldUpdate = z.infer<typeof FieldUpdateSchema>;

export const FieldRecordSchema = FieldInputSchema.extend({
  id: z.string(),
  ownerType: z.enum(['user', 'guest']),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullish(),
});
export type FieldRecord = z.infer<typeof FieldRecordSchema>;

/* ------------------------------ Saved scenarios ------------------------------ */
export const SavedScenarioInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  fieldId: z.string().nullish(),
  regionId: SlugSchema,
  farmerInputs: z.object({
    field: FieldProfileSchema,
    priorities: PrioritiesSchema,
    constraints: z.array(FarmerConstraintSchema).max(12).default([]),
  }),
  scenario: ScenarioAssumptionsSchema,
  /** The full analysis response that was displayed (comparison or scenario). */
  analysis: z.record(z.string(), z.unknown()),
  notes: z.string().max(1000).nullish(),
});
export type SavedScenarioInput = z.infer<typeof SavedScenarioInputSchema>;

export const SavedScenarioRecordSchema = SavedScenarioInputSchema.extend({
  id: z.string(),
  mode: AnalysisModeSchema,
  modelVersion: z.string().nullable(),
  analysisRequestId: z.string().nullable(),
  analysisGeneratedAt: z.string().nullable(),
  sourceIds: z.array(z.string()),
  createdAt: z.string(),
});
export type SavedScenarioRecord = z.infer<typeof SavedScenarioRecordSchema>;

/* ------------------------------ Auth ------------------------------ */
export const RegisterInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
  language: z.string().max(10).default('en'),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const UserPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['farmer', 'extension_officer', 'moderator', 'admin']),
  language: z.string(),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const SessionInfoSchema = z.object({
  authenticated: z.boolean(),
  user: UserPublicSchema.nullable(),
  guest: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

/* ------------------------------ Place search ------------------------------ */
export const GeocodeResultSchema = z.object({
  name: z.string(),
  label: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  kind: z.string().nullish(),
});
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;

/* ------------------------------ Status ------------------------------ */
export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  database: z.object({ status: z.enum(['connected', 'connecting', 'disconnected', 'not_configured']), message: z.string().nullish() }),
  analysisProvider: AnalysisModeSchema,
  time: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;

export const AnalysisStatusSchema = z.object({
  provider: AnalysisModeSchema,
  configuredProvider: AnalysisModeSchema,
  status: z.enum(['ready', 'degraded', 'unavailable']),
  name: z.string(),
  modelVersion: z.string().nullable(),
  serviceUrl: z.string().nullable(),
  capabilities: z.record(z.string(), z.unknown()).nullable(),
  supportedRegions: z.array(z.string()),
  scenarioPresets: z.array(ScenarioPresetSchema),
  message: z.string().nullable(),
  checkedAt: z.string(),
});
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

export const DataSourceStatusSchema = z.object({
  sources: z.array(
    SourceRefSchema.extend({
      usedFor: z.array(z.string()),
      regions: z.array(z.string()),
      status: z.enum(['prepared', 'demo', 'unavailable']),
    }),
  ),
  checkedAt: z.string(),
});
export type DataSourceStatus = z.infer<typeof DataSourceStatusSchema>;
