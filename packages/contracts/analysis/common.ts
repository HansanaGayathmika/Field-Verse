import { z } from 'zod';

/** Contract version shared by Express, React, and the future Python FastAPI service. */
export const SCHEMA_VERSION = '1.0' as const;
export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);

/**
 * Where a value came from. EVERY measurement or analytical result must carry one.
 * - observed:        satellite / reanalysis / station observation (e.g. NASA POWER, MODIS)
 * - estimated:       derived estimate or global prediction product (e.g. SoilGrids), or general reference ranges
 * - farmer_provided: entered by the farmer
 * - modelled:        produced by the AI/ML team's analytical model
 * - demo:            prepared, illustrative demonstration content (NOT a prediction)
 * - unavailable:     no data available
 */
export const SourceTypeSchema = z.enum(['observed', 'estimated', 'farmer_provided', 'modelled', 'demo', 'unavailable']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const AnalysisModeSchema = z.enum(['demo', 'remote']);
export type AnalysisMode = z.infer<typeof AnalysisModeSchema>;

/** Slugs: lowercase letters, digits and dashes. Identifiers are never translated. */
export const SlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase slug, e.g. "mung-bean"');

export const MonthSchema = z.number().int().min(1).max(12);

/**
 * Numerical interval. OPTIONAL everywhere — the ML team must never fabricate intervals.
 * `level` is the coverage probability (e.g. 0.9 for a 90% interval) when known.
 */
export const IntervalSchema = z
  .object({
    lower: z.number(),
    upper: z.number(),
    level: z.number().gt(0).lt(1).nullish(),
    method: z.string().max(200).nullish(),
  })
  .refine((i) => i.lower <= i.upper, { message: 'interval.lower must be <= interval.upper' });
export type Interval = z.infer<typeof IntervalSchema>;

/** Full provenance record for a data source. Referenced by `id` from results. */
export const SourceRefSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  provider: z.string().max(200).nullish(),
  sourceType: SourceTypeSchema,
  datasetVersion: z.string().max(200).nullish(),
  spatialResolution: z.string().max(100).nullish(),
  temporalCoverage: z.string().max(200).nullish(),
  url: z.string().url().nullish(),
  retrievedAt: z.string().nullish(),
  license: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/** A single value with unit + provenance. */
export const MeasuredValueSchema = z.object({
  value: z.number().nullable(),
  unit: z.string().max(40),
  sourceType: SourceTypeSchema,
  sourceId: z.string().nullish(),
  period: z.string().max(100).nullish(),
  interval: IntervalSchema.nullish(),
});
export type MeasuredValue = z.infer<typeof MeasuredValueSchema>;

export const LevelSchema = z.enum(['low', 'medium', 'high', 'unknown']);
export type Level = z.infer<typeof LevelSchema>;
