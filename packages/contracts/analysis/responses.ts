import { z } from 'zod';
import {
  AnalysisModeSchema,
  IntervalSchema,
  LevelSchema,
  MonthSchema,
  SchemaVersionSchema,
  SlugSchema,
  SourceRefSchema,
  SourceTypeSchema,
} from './common';
import { EnvironmentSummarySchema } from './environment';
import { ConstraintTypeSchema, FarmerConstraintSchema, ScenarioAssumptionsSchema } from './requests';

export const RegionSummarySchema = z.object({
  id: SlugSchema,
  name: z.string(),
  country: z.string(),
  countryCode: z.string().length(2),
  latitude: z.number(),
  longitude: z.number(),
  agroEcologicalZone: z.string().nullish(),
});
export type RegionSummary = z.infer<typeof RegionSummarySchema>;

export const SeasonSchema = z.object({
  name: z.string().max(80),
  startMonth: MonthSchema,
  endMonth: MonthSchema,
});
export type Season = z.infer<typeof SeasonSchema>;

export const RotationStepSchema = z.object({
  /** Crop identifier from the crop catalogue, or "fallow" for an intentional rest period. */
  cropId: z.union([SlugSchema, z.literal('fallow')]),
  role: z.enum(['main', 'short_season', 'cover', 'fallow']),
  season: SeasonSchema,
  /** Planting window, when known. */
  plantingWindow: z.object({ startMonth: MonthSchema, endMonth: MonthSchema }).nullish(),
  notes: z.string().max(500).nullish(),
});
export type RotationStep = z.infer<typeof RotationStepSchema>;

export const FeasibilityStatusSchema = z.enum(['feasible', 'needs_review', 'not_feasible', 'unknown']);
export type FeasibilityStatus = z.infer<typeof FeasibilityStatusSchema>;

export const IndicatorSchema = z.object({
  id: z.string().max(60),
  label: z.string().max(120),
  /** 1–5 rating, or null when unavailable. Meaning is given by `direction`. */
  rating: z.number().min(1).max(5).nullable(),
  direction: z.enum(['higher_is_better', 'lower_is_better']),
  /** "illustrative" = demo rating prepared by people; "model" = ML output. */
  ratingType: z.enum(['illustrative', 'model', 'rule']),
  sourceType: SourceTypeSchema,
  explanation: z.string().max(600),
  interval: IntervalSchema.nullish(),
});
export type Indicator = z.infer<typeof IndicatorSchema>;

export const TextItemSchema = z.object({
  text: z.string().max(600),
  sourceType: SourceTypeSchema,
});

export const RiskSchema = z.object({
  text: z.string().max(600),
  severity: z.enum(['low', 'medium', 'high']),
  sourceType: SourceTypeSchema,
});

export const DataGapSchema = z.object({
  id: z.string().max(60),
  text: z.string().max(600),
  impact: z.enum(['low', 'medium', 'high']),
});
export type DataGap = z.infer<typeof DataGapSchema>;

export const ConstraintFlagSchema = z.object({
  constraintType: ConstraintTypeSchema,
  cropId: SlugSchema.nullish(),
  effect: z.enum(['flagged', 'excluded', 'noted']),
  message: z.string().max(400),
});

export const StrategySchema = z.object({
  id: SlugSchema,
  name: z.string().max(120),
  kind: z.enum(['current', 'alternative']),
  /** One plain-language sentence for farmers. */
  summary: z.string().max(400),
  steps: z.array(RotationStepSchema).min(1).max(8),
  feasibility: z.object({
    status: FeasibilityStatusSchema,
    reasons: z.array(z.string().max(400)).default([]),
  }),
  suitability: z.object({
    level: LevelSchema,
    /** 0–100 score only when the provider genuinely has one. Demo providers must label scores "illustrative". */
    score: z.number().min(0).max(100).nullable(),
    scoreType: z.enum(['illustrative', 'model', 'none']),
    interval: IntervalSchema.nullish(),
    sourceType: SourceTypeSchema,
  }),
  indicators: z.array(IndicatorSchema).default([]),
  water: z.object({
    relativeDemand: z.enum(['lower', 'similar', 'higher', 'unknown']),
    notes: z.array(z.string().max(400)).default([]),
    sourceType: SourceTypeSchema,
  }),
  soilCover: z.object({
    monthsCovered: z.number().min(0).max(12).nullable(),
    notes: z.array(z.string().max(400)).default([]),
    sourceType: SourceTypeSchema,
  }),
  benefits: z.array(TextItemSchema).default([]),
  risks: z.array(RiskSchema).default([]),
  explanation: z.object({
    summary: z.string().max(800),
    details: z.array(z.string().max(800)).default([]),
    technical: z.string().max(2000).nullish(),
  }),
  dataGaps: z.array(DataGapSchema).default([]),
  localChecks: z.array(z.string().max(400)).default([]),
  uncertainty: z.object({
    level: LevelSchema,
    notes: z.string().max(800),
    interval: IntervalSchema.nullish(),
  }),
  constraintFlags: z.array(ConstraintFlagSchema).default([]),
  /**
   * How well this strategy matches the farmer's stated priorities, when the provider computes it.
   * `method` tells the UI whether it is a documented rule (demo) or a model output.
   */
  priorityFit: z
    .object({
      rank: z.number().int().min(1),
      method: z.enum(['rule', 'model']),
      explanation: z.string().max(600),
    })
    .nullish(),
  sourceIds: z.array(z.string()).default([]),
});
export type Strategy = z.infer<typeof StrategySchema>;

export const AppliedScenarioSchema = ScenarioAssumptionsSchema.extend({
  presetId: z.string().max(60).nullish(),
  label: z.string().max(120),
});
export type AppliedScenario = z.infer<typeof AppliedScenarioSchema>;

export const ConstraintResultSchema = z.object({
  constraint: FarmerConstraintSchema,
  handled: z.boolean(),
  handling: z.enum(['rule', 'model', 'not_supported']),
  message: z.string().max(600),
});
export type ConstraintResult = z.infer<typeof ConstraintResultSchema>;

const responseBase = {
  schemaVersion: SchemaVersionSchema,
  requestId: z.string().min(1).max(100),
  mode: AnalysisModeSchema,
  /** Null in demo mode. The ML service must report its real model version. */
  modelVersion: z.string().max(100).nullable(),
  region: RegionSummarySchema,
  limitations: z.array(z.string().max(800)),
  dataSources: z.array(SourceRefSchema),
  /** Short notice shown prominently. Demo responses must state they are illustrative. */
  disclaimer: z.string().max(800),
  generatedAt: z.string().datetime({ offset: true }),
};

export const RotationComparisonResponseSchema = z.object({
  ...responseBase,
  analysisType: z.literal('rotation_comparison'),
  environment: EnvironmentSummarySchema.nullable(),
  scenario: AppliedScenarioSchema,
  strategies: z.array(StrategySchema).min(1).max(6),
  constraintsApplied: z.array(ConstraintResultSchema).default([]),
});
export type RotationComparisonResponse = z.infer<typeof RotationComparisonResponseSchema>;

export const StrategyChangeSchema = z.object({
  strategyId: SlugSchema,
  direction: z.enum(['improves', 'worsens', 'unchanged', 'unknown']),
  feasibilityBefore: FeasibilityStatusSchema,
  feasibilityAfter: FeasibilityStatusSchema,
  summary: z.string().max(600),
});
export type StrategyChange = z.infer<typeof StrategyChangeSchema>;

export const ClimateContextSchema = z.object({
  baselineAnnualRainfallMm: z.number().nullable(),
  hypotheticalAnnualRainfallMm: z.number().nullable(),
  baselineMeanTemperatureC: z.number().nullable(),
  hypotheticalMeanTemperatureC: z.number().nullable(),
  note: z.string().max(600),
});

export const ClimateScenarioResponseSchema = z.object({
  ...responseBase,
  analysisType: z.literal('climate_scenario'),
  baseline: AppliedScenarioSchema,
  modified: AppliedScenarioSchema,
  climateContext: ClimateContextSchema,
  strategies: z.array(StrategySchema).min(1).max(6),
  changes: z.array(StrategyChangeSchema),
  explanation: z.array(z.string().max(800)),
  constraintsApplied: z.array(ConstraintResultSchema).default([]),
});
export type ClimateScenarioResponse = z.infer<typeof ClimateScenarioResponseSchema>;

export const CalendarEntrySchema = z.object({
  cropId: z.union([SlugSchema, z.literal('fallow')]),
  label: z.string().max(120),
  months: z.array(MonthSchema).min(1),
  plantingMonths: z.array(MonthSchema).default([]),
  harvestMonths: z.array(MonthSchema).default([]),
  sourceType: SourceTypeSchema,
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;

export const IdleWindowSchema = z.object({
  startMonth: MonthSchema,
  endMonth: MonthSchema,
  months: z.array(MonthSchema).min(1),
  rainfallMm: z.number().nullable(),
  rainfallSourceId: z.string().nullish(),
});
export type IdleWindow = z.infer<typeof IdleWindowSchema>;

export const GapCandidateSchema = z.object({
  cropId: z.union([SlugSchema, z.literal('fallow')]),
  role: z.enum(['short_season', 'cover', 'fallow']),
  windowIndex: z.number().int().min(0),
  durationDays: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).nullable(),
  fit: z.enum(['fits', 'tight', 'does_not_fit', 'unknown']),
  fitMethod: z.enum(['rule', 'model', 'demo']),
  benefits: z.array(z.string().max(400)),
  risks: z.array(z.string().max(400)),
  waterNote: z.string().max(400).nullish(),
  explanation: z.string().max(800),
  sourceType: SourceTypeSchema,
});
export type GapCandidate = z.infer<typeof GapCandidateSchema>;

export const GapAnalysisResponseSchema = z.object({
  ...responseBase,
  analysisType: z.literal('gap_analysis'),
  currentCalendar: z.array(CalendarEntrySchema),
  idleWindows: z.array(IdleWindowSchema),
  candidates: z.array(GapCandidateSchema),
});
export type GapAnalysisResponse = z.infer<typeof GapAnalysisResponseSchema>;

export const ScenarioPresetSchema = ScenarioAssumptionsSchema.extend({
  id: z.string().max(60),
  label: z.string().max(120),
  description: z.string().max(400).nullish(),
});
export type ScenarioPreset = z.infer<typeof ScenarioPresetSchema>;

export const ModelInfoSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  provider: AnalysisModeSchema,
  name: z.string().max(200),
  modelVersion: z.string().max(100).nullable(),
  status: z.enum(['ready', 'degraded', 'unavailable']),
  capabilities: z.object({
    rotationComparison: z.boolean(),
    climateScenario: z.boolean(),
    gapAnalysis: z.boolean(),
    constraints: z.enum(['none', 'rules', 'model']),
    /** "presets" = only listed scenario presets; "continuous" = any value in range. */
    scenarioInput: z.enum(['presets', 'continuous']),
  }),
  supportedRegions: z.array(SlugSchema),
  supportedCrops: z.array(SlugSchema).default([]),
  scenarioPresets: z.array(ScenarioPresetSchema).default([]),
  trainingDataSummary: z.string().max(2000).nullish(),
  lastUpdated: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/** Error body the Python service should return for non-2xx responses. */
export const AnalysisErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'REGION_NOT_SUPPORTED',
  'CROP_NOT_SUPPORTED',
  'SCENARIO_NOT_SUPPORTED',
  'DATA_UNAVAILABLE',
  'MODEL_NOT_READY',
  'INTERNAL_ERROR',
]);
export const AnalysisErrorBodySchema = z.object({
  error: z.object({
    code: AnalysisErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type AnalysisErrorBody = z.infer<typeof AnalysisErrorBodySchema>;
