import { z } from 'zod';
import { MonthSchema, SchemaVersionSchema, SlugSchema } from './common';

export const SoilTypeSchema = z.enum(['clay', 'loam', 'sandy', 'silt', 'unknown']);
export type SoilType = z.infer<typeof SoilTypeSchema>;

export const IrrigationSchema = z.enum(['none', 'limited', 'full', 'unknown']);
export type Irrigation = z.infer<typeof IrrigationSchema>;

/** Standing water in the rainy season (spec key `waterlogging`). */
export const WaterloggingSchema = z.enum(['several_weeks', 'few_days', 'drains_well', 'unknown']);
export type Waterlogging = z.infer<typeof WaterloggingSchema>;

/** Usual farm input level (spec key `input_level`), selecting the low/high-input suitability layer. */
export const InputLevelSchema = z.enum(['minimal', 'moderate', 'high', 'unknown']);
export type InputLevel = z.infer<typeof InputLevelSchema>;

/**
 * Farmer-entered field description. Values the farmer did not know are "unknown"/null — never guessed.
 * Spec keys (Farmer Input Form Specification) are noted per field.
 */
export const FieldProfileSchema = z.object({
  /** `location` */
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** `current_crop` — crop id, "fallow" (nothing planted) or a farmer-added crop slug. */
  currentCrop: SlugSchema,
  /** `previous_crop`, `previous_crop_2` — most recent first; may contain "fallow". Unknown seasons are omitted. */
  cropHistory: z.array(SlugSchema).max(12).default([]),
  /** `harvest_month` — 1–12, "harvested" (already harvested), or null (I do not know). */
  harvestMonth: z.union([z.number().int().min(1).max(12), z.literal('harvested')]).nullish(),
  /** `next_planting_month` — 1–12, or null (I am not sure → estimate from local rainfall). */
  nextPlantingMonth: z.number().int().min(1).max(12).nullish(),
  /** `seasons_per_year` — 1, 2, 3, or null (I am not sure). */
  seasonsPerYear: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullish(),
  /** `soil_texture` */
  soilType: SoilTypeSchema.default('unknown'),
  /** `soil_ph` — from a soil test only. */
  soilPh: z.number().min(3).max(10).nullish(),
  /** `water_access` — none = rainfall only; limited = not every season; full = reliable all year. */
  irrigation: IrrigationSchema.default('unknown'),
  /** `waterlogging` */
  waterlogging: WaterloggingSchema.default('unknown'),
  /** `input_level` */
  inputLevel: InputLevelSchema.default('unknown'),
  /** `excluded_crops` — crops the farmer cannot or will not grow; removed from recommendations. */
  excludedCrops: z.array(SlugSchema).max(30).default([]),
  areaHectares: z.number().positive().max(100000).nullish(),
});
export type FieldProfile = z.infer<typeof FieldProfileSchema>;

/**
 * Farmer priorities — each weight is 0..1. They are relative importance weights;
 * the provider should normalise them if needed. Not required to sum to 1.
 */
export const PrioritiesSchema = z.object({
  water: z.number().min(0).max(1),
  soilHealth: z.number().min(0).max(1),
  risk: z.number().min(0).max(1),
  income: z.number().min(0).max(1),
  /** "Make productive use of fallow periods" (spec `fallow_use`). */
  idleLand: z.number().min(0).max(1).default(0),
  /** "Secure my household's food supply" (spec `food_security`). */
  foodSecurity: z.number().min(0).max(1).default(0),
});
export type Priorities = z.infer<typeof PrioritiesSchema>;

/** Hypothetical climate assumptions relative to the observed baseline. NOT a forecast. */
export const ScenarioAssumptionsSchema = z.object({
  rainfallChangePercent: z.number().min(-50).max(50),
  temperatureChangeCelsius: z.number().min(-2).max(5),
});
export type ScenarioAssumptions = z.infer<typeof ScenarioAssumptionsSchema>;

/** "Farmer's Right to Disagree" — corrections the farmer makes to the analysis assumptions. */
export const ConstraintTypeSchema = z.enum([
  'no_irrigation',
  'seeds_unavailable',
  'soil_floods',
  'cannot_sell',
  'lacks_equipment',
  'crop_failed_before',
  /** Set by the provider for crops listed in `field.excludedCrops`. */
  'excluded_crop',
]);
export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;

export const FarmerConstraintSchema = z.object({
  type: ConstraintTypeSchema,
  /** Required for crop-specific constraints (seeds_unavailable, cannot_sell, crop_failed_before). */
  cropId: SlugSchema.nullish(),
  note: z.string().max(280).nullish(),
});
export type FarmerConstraint = z.infer<typeof FarmerConstraintSchema>;

export const CROP_SPECIFIC_CONSTRAINTS: ConstraintType[] = ['seeds_unavailable', 'cannot_sell', 'crop_failed_before', 'excluded_crop'];

const baseRequest = {
  schemaVersion: SchemaVersionSchema,
  regionId: SlugSchema,
  field: FieldProfileSchema,
  priorities: PrioritiesSchema,
  scenario: ScenarioAssumptionsSchema.default({ rainfallChangePercent: 0, temperatureChangeCelsius: 0 }),
  constraints: z.array(FarmerConstraintSchema).max(12).default([]),
  /** BCP-47 language tag for human-readable text, e.g. "en". Providers may ignore it. */
  locale: z.string().max(10).default('en'),
};

function checkConstraints(
  req: { constraints: FarmerConstraint[] },
  ctx: z.RefinementCtx,
) {
  req.constraints.forEach((c, i) => {
    if (CROP_SPECIFIC_CONSTRAINTS.includes(c.type) && !c.cropId) {
      ctx.addIssue({ code: 'custom', path: ['constraints', i, 'cropId'], message: `cropId is required for constraint "${c.type}"` });
    }
  });
}

export const RotationComparisonRequestSchema = z.object(baseRequest).superRefine(checkConstraints);
export type RotationComparisonRequest = z.infer<typeof RotationComparisonRequestSchema>;
export type RotationComparisonRequestInput = z.input<typeof RotationComparisonRequestSchema>;

export const ClimateScenarioRequestSchema = z
  .object({
    ...baseRequest,
    scenario: ScenarioAssumptionsSchema,
    /** Optional: id of the baseline comparison the farmer is modifying. */
    baselineRequestId: z.string().max(100).nullish(),
  })
  .superRefine(checkConstraints);
export type ClimateScenarioRequest = z.infer<typeof ClimateScenarioRequestSchema>;
export type ClimateScenarioRequestInput = z.input<typeof ClimateScenarioRequestSchema>;

export const GapAnalysisRequestSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  regionId: SlugSchema,
  field: FieldProfileSchema,
  /** Months (1–12) the farmer marked as idle / no crop in the ground. */
  idleMonths: z.array(MonthSchema).max(12).default([]),
  locale: z.string().max(10).default('en'),
});
export type GapAnalysisRequest = z.infer<typeof GapAnalysisRequestSchema>;
export type GapAnalysisRequestInput = z.input<typeof GapAnalysisRequestSchema>;
