import { describe, expect, it } from 'vitest';
import {
  ClimateScenarioResponseSchema,
  GapAnalysisResponseSchema,
  RotationComparisonRequestSchema,
  RotationComparisonResponseSchema,
  type RotationComparisonRequestInput,
} from '@fieldverse/contracts';
import { DemoAnalysisAdapter, groupIdleWindows, monthRange } from '../src/adapters/analysis/DemoAnalysisAdapter';
import { referenceData } from '../src/services/referenceData';

const demo = new DemoAnalysisAdapter();

function req(regionId: string, overrides: Partial<RotationComparisonRequestInput> = {}) {
  const region = referenceData.getRegion(regionId)!;
  return RotationComparisonRequestSchema.parse({
    schemaVersion: '1.0',
    regionId,
    field: { latitude: region.latitude, longitude: region.longitude, currentCrop: region.demoFarm.currentCrop, irrigation: 'limited' },
    priorities: { water: 0.4, soilHealth: 0.3, risk: 0.2, income: 0.1 },
    ...overrides,
  });
}

describe('helpers', () => {
  it('monthRange wraps across the year', () => {
    expect(monthRange(10, 2)).toEqual([10, 11, 12, 1, 2]);
    expect(monthRange(4, 4)).toEqual([4]);
  });
  it('groupIdleWindows groups consecutive months including Dec→Jan', () => {
    expect(groupIdleWindows([12, 1, 2, 6])).toEqual([[6], [12, 1, 2]]);
    expect(groupIdleWindows([])).toEqual([]);
    expect(groupIdleWindows([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toHaveLength(1);
  });
});

describe('DemoAnalysisAdapter.compareRotations', () => {
  for (const region of referenceData.listRegions()) {
    it(`returns a schema-valid, demo-labelled comparison for ${region.id}`, async () => {
      const res = await demo.compareRotations(req(region.id));
      expect(RotationComparisonResponseSchema.safeParse(res).success).toBe(true);
      expect(res.mode).toBe('demo');
      expect(res.modelVersion).toBeNull();
      expect(res.strategies.length).toBe(3);
      expect(res.strategies.filter((s) => s.kind === 'current')).toHaveLength(1);
      expect(res.disclaimer).toMatch(/not machine-learning predictions/i);
      expect(res.limitations[0]).toMatch(/DEMO MODE/);
      expect(res.dataSources.some((s) => s.sourceType === 'demo')).toBe(true);
      // every strategy is ranked by the documented rule, never labelled as a model output
      for (const s of res.strategies) {
        expect(s.priorityFit?.method).toBe('rule');
        for (const ind of s.indicators) expect(ind.ratingType).toBe('illustrative');
        expect(s.suitability.scoreType).not.toBe('model');
      }
      // region-specific content
      expect(res.region.id).toBe(region.id);
    });
  }

  it('rejects regions that are not prepared', async () => {
    await expect(demo.compareRotations(req('sri-lanka-anuradhapura', { regionId: 'atlantis' }))).rejects.toMatchObject({ code: 'REGION_NOT_SUPPORTED' });
  });

  it('rejects locations outside the demo radius instead of guessing', async () => {
    const r = req('sri-lanka-anuradhapura');
    r.field.latitude = 6.9; // Colombo, ~170 km away
    r.field.longitude = 79.86;
    await expect(demo.compareRotations(r)).rejects.toMatchObject({ code: 'REGION_NOT_SUPPORTED' });
  });

  it('rejects current crops without prepared fixtures', async () => {
    const r = req('sri-lanka-anuradhapura');
    r.field.currentCrop = 'maize';
    await expect(demo.compareRotations(r)).rejects.toMatchObject({ code: 'CROP_NOT_SUPPORTED' });
    r.field.currentCrop = 'banana';
    await expect(demo.compareRotations(r)).rejects.toMatchObject({ code: 'CROP_NOT_SUPPORTED' });
  });

  it('rejects unsupported scenario combinations with the list of presets', async () => {
    const r = req('kenya-nakuru');
    r.scenario = { rainfallChangePercent: -10, temperatureChangeCelsius: 0.5 };
    await expect(demo.compareRotations(r)).rejects.toMatchObject({ code: 'SCENARIO_NOT_SUPPORTED', details: { supportedPresets: expect.any(Array) } });
  });

  it('priority weights change the ordering only, by a documented rule', async () => {
    const water = await demo.compareRotations(req('sri-lanka-anuradhapura', { priorities: { water: 1, soilHealth: 0, risk: 0, income: 0 } }));
    const top = water.strategies.find((s) => s.priorityFit?.rank === 1)!;
    expect(top.id).not.toBe('current-rice-rice'); // rice-rice has the highest illustrative water demand
  });
});

describe("Farmer's Right to Disagree rules", () => {
  it('no_irrigation flags Yala rice using observed rainfall', async () => {
    const res = await demo.compareRotations(req('sri-lanka-anuradhapura', { constraints: [{ type: 'no_irrigation' }] }));
    const current = res.strategies.find((s) => s.id === 'current-rice-rice')!;
    expect(current.feasibility.status).toBe('needs_review');
    expect(current.constraintFlags.some((f) => f.constraintType === 'no_irrigation' && /NASA POWER/.test(f.message))).toBe(true);
    expect(res.constraintsApplied[0]).toMatchObject({ handled: true, handling: 'rule' });
  });

  it('field irrigation "none" applies the same rule automatically', async () => {
    const r = req('sri-lanka-anuradhapura');
    r.field.irrigation = 'none';
    const res = await demo.compareRotations(r);
    expect(res.constraintsApplied.some((c) => c.constraint.type === 'no_irrigation')).toBe(true);
  });

  it('seeds_unavailable makes strategies using that crop not feasible', async () => {
    const res = await demo.compareRotations(req('sri-lanka-anuradhapura', { constraints: [{ type: 'seeds_unavailable', cropId: 'mung-bean' }] }));
    expect(res.strategies.find((s) => s.id === 'alt-rice-mung-bean')!.feasibility.status).toBe('not_feasible');
    expect(res.strategies.find((s) => s.id === 'alt-rice-cowpea-sunn-hemp')!.feasibility.status).toBe('needs_review'); // unchanged baseline
  });

  it('crops the farmer excludes remove the strategies that use them', async () => {
    const r = req('sri-lanka-anuradhapura');
    r.field.excludedCrops = ['cowpea'];
    const res = await demo.compareRotations(r);
    const cowpea = res.strategies.find((s) => s.id === 'alt-rice-cowpea-sunn-hemp')!;
    expect(cowpea.feasibility.status).toBe('not_feasible');
    expect(cowpea.constraintFlags).toContainEqual(expect.objectContaining({ constraintType: 'excluded_crop', effect: 'excluded' }));
    expect(res.strategies.find((s) => s.id === 'alt-rice-mung-bean')!.feasibility.status).toBe('feasible');
  });

  it('standing water for several weeks applies the waterlogging rule automatically', async () => {
    const r = req('sri-lanka-anuradhapura');
    r.field.waterlogging = 'several_weeks';
    const res = await demo.compareRotations(r);
    expect(res.constraintsApplied.some((c) => c.constraint.type === 'soil_floods' && c.handling === 'rule')).toBe(true);
    expect(res.strategies.find((s) => s.id === 'alt-rice-mung-bean')!.feasibility.status).toBe('needs_review');
  });

  it('answers the demo cannot use are listed honestly in the limitations', async () => {
    const r = req('kenya-nakuru');
    r.field.nextPlantingMonth = 10;
    r.field.inputLevel = 'moderate';
    r.priorities.foodSecurity = 1;
    const res = await demo.compareRotations(r);
    expect(res.limitations.join(' ')).toMatch(/not used by the demo examples: next planting month, input level, household food security priority/);
  });

  it('lacks_equipment is honestly reported as not assessed', async () => {
    const res = await demo.compareRotations(req('brazil-mato-grosso', { constraints: [{ type: 'lacks_equipment' }] }));
    expect(res.constraintsApplied[0]).toMatchObject({ handled: false, handling: 'not_supported' });
  });
});

describe('DemoAnalysisAdapter.analyzeScenario', () => {
  it('returns prepared effects and arithmetic climate context for a preset', async () => {
    const base = req('sri-lanka-anuradhapura');
    const res = await demo.analyzeScenario({ ...base, scenario: { rainfallChangePercent: -20, temperatureChangeCelsius: 2 }, baselineRequestId: null });
    expect(ClimateScenarioResponseSchema.safeParse(res).success).toBe(true);
    expect(res.modified.presetId).toBe('hot-dry');
    expect(res.changes.find((c) => c.strategyId === 'current-rice-rice')).toMatchObject({ direction: 'worsens', feasibilityAfter: 'not_feasible' });
    const ctx = res.climateContext;
    expect(ctx.hypotheticalAnnualRainfallMm).toBe(Math.round(ctx.baselineAnnualRainfallMm! * 0.8));
    expect(ctx.note).toMatch(/not a forecast/i);
  });
});

describe('DemoAnalysisAdapter.analyzeGaps', () => {
  it('groups idle months and computes fit by documented rule with real rainfall', async () => {
    const region = referenceData.getRegion('kenya-nakuru')!;
    const res = await demo.analyzeGaps({
      schemaVersion: '1.0',
      regionId: region.id,
      field: { latitude: region.latitude, longitude: region.longitude, currentCrop: 'maize', cropHistory: [], soilType: 'unknown', irrigation: 'none', waterlogging: 'unknown', inputLevel: 'unknown', excludedCrops: [] },
      idleMonths: [9, 10, 11, 12, 1, 2],
      locale: 'en',
    });
    expect(GapAnalysisResponseSchema.safeParse(res).success).toBe(true);
    expect(res.idleWindows).toHaveLength(1);
    expect(res.idleWindows[0].months).toEqual([9, 10, 11, 12, 1, 2]);
    expect(res.idleWindows[0].rainfallMm).toBeGreaterThan(0);
    const bean = res.candidates.find((c) => c.cropId === 'common-bean')!;
    expect(bean.fit).toBe('fits');
    expect(bean.fitMethod).toBe('rule');
    expect(res.candidates.some((c) => c.cropId === 'fallow')).toBe(true);
  });

  it('marks long crops as not fitting short windows', async () => {
    const region = referenceData.getRegion('sri-lanka-anuradhapura')!;
    const res = await demo.analyzeGaps({
      schemaVersion: '1.0',
      regionId: region.id,
      field: { latitude: region.latitude, longitude: region.longitude, currentCrop: 'rice', cropHistory: [], soilType: 'unknown', irrigation: 'limited', waterlogging: 'unknown', inputLevel: 'unknown', excludedCrops: [] },
      idleMonths: [3],
      locale: 'en',
    });
    expect(res.candidates.find((c) => c.cropId === 'mung-bean')!.fit).toBe('does_not_fit');
  });
});

describe('fixtures', () => {
  it('every crop referenced in fixtures exists in the catalogue', () => {
    for (const r of referenceData.listRegions()) {
      for (const c of [...r.supportedCrops, ...r.commonCrops, r.demoFarm.currentCrop]) expect(referenceData.getCrop(c), `${r.id}: ${c}`).not.toBeNull();
    }
  });
});
