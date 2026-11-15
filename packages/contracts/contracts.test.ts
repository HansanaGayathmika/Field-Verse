import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AnalysisErrorBodySchema,
  ClimateScenarioRequestSchema,
  ClimateScenarioResponseSchema,
  GapAnalysisRequestSchema,
  GapAnalysisResponseSchema,
  IntervalSchema,
  ModelInfoSchema,
  RotationComparisonRequestSchema,
  RotationComparisonResponseSchema,
} from './index';

const dir = path.join(__dirname, 'analysis', 'examples');
const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));

const SCHEMA_FOR: Record<string, { safeParse: (v: unknown) => { success: boolean; error?: unknown } }> = {
  'rotation-comparison.request.json': RotationComparisonRequestSchema,
  'climate-scenario.request.json': ClimateScenarioRequestSchema,
  'gap-analysis.request.json': GapAnalysisRequestSchema,
  'rotation-comparison.demo.response.json': RotationComparisonResponseSchema,
  'climate-scenario.demo.response.json': ClimateScenarioResponseSchema,
  'gap-analysis.demo.response.json': GapAnalysisResponseSchema,
  'model-info.demo.response.json': ModelInfoSchema,
  'error.scenario-not-supported.json': AnalysisErrorBodySchema,
};

describe('contract example fixtures', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(`${file} matches its schema`, () => {
      const schema = SCHEMA_FOR[file];
      expect(schema, `no schema mapped for ${file}`).toBeDefined();
      const r = schema.safeParse(read(file));
      if (!r.success) console.error(JSON.stringify(r.error, null, 2));
      expect(r.success).toBe(true);
    });
  }
});

describe('contract rules', () => {
  const base = read('rotation-comparison.request.json');

  it('requires cropId for crop-specific constraints', () => {
    const r = RotationComparisonRequestSchema.safeParse({ ...base, constraints: [{ type: 'seeds_unavailable' }] });
    expect(r.success).toBe(false);
  });

  it('rejects out-of-range priorities and scenario values', () => {
    expect(RotationComparisonRequestSchema.safeParse({ ...base, priorities: { ...base.priorities, water: 2 } }).success).toBe(false);
    expect(RotationComparisonRequestSchema.safeParse({ ...base, scenario: { rainfallChangePercent: -90, temperatureChangeCelsius: 0 } }).success).toBe(false);
  });

  it('rejects non-slug identifiers', () => {
    expect(RotationComparisonRequestSchema.safeParse({ ...base, regionId: 'Sri Lanka!' }).success).toBe(false);
  });

  it('allows missing intervals but rejects inverted ones', () => {
    expect(IntervalSchema.safeParse({ lower: 1, upper: 2 }).success).toBe(true);
    expect(IntervalSchema.safeParse({ lower: 3, upper: 2 }).success).toBe(false);
  });

  it('defaults optional request fields', () => {
    const { constraints: _c, scenario: _s, locale: _l, ...minimal } = base;
    const r = RotationComparisonRequestSchema.parse(minimal);
    expect(r.constraints).toEqual([]);
    expect(r.scenario).toEqual({ rainfallChangePercent: 0, temperatureChangeCelsius: 0 });
  });

  it('json-schema export exists when generated', () => {
    const js = path.join(__dirname, 'analysis', 'json-schema');
    if (existsSync(js)) expect(readdirSync(js).length).toBeGreaterThan(0);
  });
});
