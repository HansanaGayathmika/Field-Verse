import { z } from 'zod';
import { IntervalSchema, MeasuredValueSchema, MonthSchema, SourceTypeSchema } from './common';

export const LocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Location = z.infer<typeof LocationSchema>;

/** Monthly climate normal. Rainfall in millimetres per month, temperature in °C. */
export const MonthlyClimateSchema = z.object({
  month: MonthSchema,
  rainfallMm: z.number().min(0).nullable(),
  rainfallMmPerDay: z.number().min(0).nullish(),
  temperatureMeanC: z.number().nullable(),
  temperatureMaxC: z.number().nullish(),
  temperatureMinC: z.number().nullish(),
});
export type MonthlyClimate = z.infer<typeof MonthlyClimateSchema>;

export const AnnualClimateSchema = z.object({
  year: z.number().int().min(1900).max(2200),
  rainfallTotalMm: z.number().min(0).nullable(),
  temperatureMeanC: z.number().nullable(),
});

/** Soil property values by depth. All fields optional + nullable: never fabricate missing soil values. */
const soilValueShape = {
  phH2O: z.number().nullish(),
  organicCarbonGPerKg: z.number().nullish(),
  clayPercent: z.number().nullish(),
  sandPercent: z.number().nullish(),
  siltPercent: z.number().nullish(),
  nitrogenGPerKg: z.number().nullish(),
  bulkDensityGPerCm3: z.number().nullish(),
  cecCmolPerKg: z.number().nullish(),
};
export const SoilPropertyKeys = Object.keys(soilValueShape) as (keyof typeof soilValueShape)[];
export type SoilPropertyKey = keyof typeof soilValueShape;

export const SoilLayerSchema = z.object({
  depthLabel: z.string().max(20),
  topCm: z.number().min(0),
  bottomCm: z.number().min(0),
  values: z.object(soilValueShape),
  intervals: z
    .object(Object.fromEntries(SoilPropertyKeys.map((k) => [k, IntervalSchema.nullish()])) as Record<SoilPropertyKey, z.ZodOptional<z.ZodNullable<typeof IntervalSchema>>>)
    .partial()
    .nullish(),
});
export type SoilLayer = z.infer<typeof SoilLayerSchema>;

export const NdviPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ndvi: z.number().min(-1).max(1).nullable(),
});

export const TimelapseMediaSchema = z.object({
  webm: z.string().nullish(),
  mp4: z.string().nullish(),
  poster: z.string().nullish(),
  year: z.number().int(),
  framesPerSecond: z.number().positive(),
  boundingBox: z.object({ minLat: z.number(), minLon: z.number(), maxLat: z.number(), maxLon: z.number() }).nullish(),
  sourceId: z.string(),
});

/**
 * Environmental information for a field/region. Every block references a source in
 * the response's `dataSources` by `sourceId`. Blocks are nullable when unavailable.
 */
export const EnvironmentSummarySchema = z.object({
  location: LocationSchema,
  climate: z
    .object({
      monthly: z.array(MonthlyClimateSchema).length(12),
      period: z.string().max(200),
      sourceId: z.string(),
      sourceType: SourceTypeSchema,
    })
    .nullable(),
  annual: z
    .object({
      years: z.array(AnnualClimateSchema),
      sourceId: z.string(),
      sourceType: SourceTypeSchema,
    })
    .nullable(),
  soil: z
    .object({
      layers: z.array(SoilLayerSchema).min(1),
      sourceId: z.string(),
      sourceType: SourceTypeSchema,
    })
    .nullable(),
  vegetation: z
    .object({
      ndvi: z.array(NdviPointSchema),
      sourceId: z.string(),
      sourceType: SourceTypeSchema,
    })
    .nullable(),
  media: z.object({ ndviTimelapse: TimelapseMediaSchema.nullish() }).nullish(),
  /** Headline numbers, each with provenance. */
  highlights: z
    .object({
      annualRainfallMm: MeasuredValueSchema.nullish(),
      meanTemperatureC: MeasuredValueSchema.nullish(),
      topsoilPh: MeasuredValueSchema.nullish(),
      topsoilOrganicCarbonGPerKg: MeasuredValueSchema.nullish(),
      meanNdvi: MeasuredValueSchema.nullish(),
    })
    .nullish(),
});
export type EnvironmentSummary = z.infer<typeof EnvironmentSummarySchema>;
