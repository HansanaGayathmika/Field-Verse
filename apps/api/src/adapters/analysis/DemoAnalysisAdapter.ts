import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ClimateScenarioResponseSchema,
  GapAnalysisResponseSchema,
  LevelSchema,
  RiskSchema,
  RotationComparisonResponseSchema,
  SCHEMA_VERSION,
  ScenarioPresetSchema,
  StrategySchema,
  CalendarEntrySchema,
  FeasibilityStatusSchema,
  type ClimateScenarioRequest,
  type ClimateScenarioResponse,
  type ConstraintResult,
  type EnvironmentSummary,
  type FarmerConstraint,
  type FieldProfile,
  type FeasibilityStatus,
  type GapAnalysisRequest,
  type GapAnalysisResponse,
  type GapCandidate,
  type IdleWindow,
  type ModelInfo,
  type Priorities,
  type Region,
  type RegionSummary,
  type RotationComparisonRequest,
  type RotationComparisonResponse,
  type ScenarioAssumptions,
  type ScenarioPreset,
  type SourceRef,
  type Strategy,
  type StrategyChange,
} from '@fieldverse/contracts';
import { referenceData } from '../../services/referenceData';
import type { AnalysisProvider } from './AnalysisProvider';
import { AnalysisError } from './errors';

/* ------------------------------------------------------------------ */
/* Fixture formats (internal to the demo adapter)                      */
/* ------------------------------------------------------------------ */
const RotationFixtureSchema = z.object({
  schemaVersion: z.literal('1.0'),
  fixtureType: z.literal('illustrative_demo'),
  appliesTo: z.object({ currentCrops: z.array(z.string()).min(1) }),
  limitations: z.array(z.string()),
  strategies: z.array(StrategySchema.omit({ sourceIds: true, constraintFlags: true, priorityFit: true })).min(1),
});

const StrategyEffectSchema = z.object({
  feasibility: FeasibilityStatusSchema.optional(),
  feasibilityReason: z.string().optional(),
  suitabilityLevel: LevelSchema.optional(),
  indicatorDeltas: z.record(z.string(), z.number()).optional(),
  addRisk: RiskSchema.omit({ sourceType: true }).optional(),
  direction: z.enum(['improves', 'worsens', 'unchanged', 'unknown']),
  summary: z.string(),
});

const ScenarioFixtureSchema = z.object({
  schemaVersion: z.literal('1.0'),
  fixtureType: z.literal('illustrative_demo'),
  presets: z.array(ScenarioPresetSchema).min(1),
  effects: z.record(
    z.string(),
    z.object({ explanation: z.array(z.string()), strategies: z.record(z.string(), StrategyEffectSchema) }),
  ),
});

const GapFixtureSchema = z.object({
  schemaVersion: z.literal('1.0'),
  fixtureType: z.literal('illustrative_demo'),
  calendar: z.array(CalendarEntrySchema),
  defaultIdleMonths: z.array(z.number().int().min(1).max(12)),
  candidates: z.array(
    z.object({
      cropId: z.string(),
      role: z.enum(['short_season', 'cover']),
      benefits: z.array(z.string()),
      risks: z.array(z.string()),
      explanation: z.string(),
    }),
  ),
});

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */
export const DEMO_SOURCE: SourceRef = {
  id: 'fieldverse-demo-fixtures',
  name: 'FieldVerse illustrative demo fixtures',
  provider: 'FieldVerse Software Engineering team',
  sourceType: 'demo',
  datasetVersion: 'demo-fixtures-1.0',
  notes:
    'Hand-prepared demonstration strategies, scenario descriptions and ratings. NOT machine-learning predictions. Will be replaced by the AI/ML team analysis service.',
};
export const CROP_REFERENCE_SOURCE: SourceRef = {
  id: 'fieldverse-crop-reference',
  name: 'General crop reference ranges',
  provider: 'FieldVerse Software Engineering team',
  sourceType: 'estimated',
  notes: 'Broad typical crop durations and tolerances across varieties. Verify locally.',
};

const DISCLAIMER =
  'Illustrative demo: these strategies were prepared by people to demonstrate FieldVerse. They are not machine-learning predictions or agronomic advice. Always check with a local agricultural expert.';

/** Documented rule thresholds: average monthly rain (mm) below which a crop step likely needs irrigation. */
export const RAIN_NEED_THRESHOLDS_MM: Record<'low' | 'medium' | 'high', number> = { low: 40, medium: 75, high: 150 };

const FEAS_ORDER: Record<FeasibilityStatus, number> = { feasible: 0, unknown: 1, needs_review: 2, not_feasible: 3 };
const worse = (a: FeasibilityStatus, b: FeasibilityStatus) => (FEAS_ORDER[b] > FEAS_ORDER[a] ? b : a);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Months from start to end inclusive, wrapping across the new year (e.g. 10→2). */
export function monthRange(start: number, end: number): number[] {
  const out: number[] = [];
  let m = start;
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === end) break;
    m = (m % 12) + 1;
  }
  return out;
}

/** Group months into consecutive windows (wrapping Dec→Jan). */
export function groupIdleWindows(months: number[]): number[][] {
  const set = new Set(months);
  if (set.size === 0) return [];
  if (set.size === 12) return [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]];
  // start at a month whose predecessor is not idle
  const starts = [...set].filter((m) => !set.has(m === 1 ? 12 : m - 1)).sort((a, b) => a - b);
  return starts.map((s) => {
    const w = [s];
    let n = (s % 12) + 1;
    while (set.has(n)) {
      w.push(n);
      n = (n % 12) + 1;
    }
    return w;
  });
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const sameScenario = (a: ScenarioAssumptions, b: ScenarioAssumptions) =>
  Math.abs(a.rainfallChangePercent - b.rainfallChangePercent) < 1e-6 && Math.abs(a.temperatureChangeCelsius - b.temperatureChangeCelsius) < 1e-6;

/* ------------------------------------------------------------------ */
export class DemoAnalysisAdapter implements AnalysisProvider {
  readonly mode = 'demo' as const;

  /* ---------------- shared loaders ---------------- */
  private loadRegion(regionId: string) {
    const bundle = referenceData.getBundle(regionId);
    if (!bundle && regionId === 'custom') {
      throw new AnalysisError(
        'REGION_NOT_SUPPORTED',
        'Prepared rotation examples exist only for the three demo regions. For your location, FieldVerse shows real NASA climate and soil information on My Farm; rotation analysis will come from the AI/ML analysis service when it is connected.',
        { supportedRegions: referenceData.listRegions().map((r) => r.id), customLocation: true },
      );
    }
    if (!bundle) {
      throw new AnalysisError('REGION_NOT_SUPPORTED', `The demo does not include region "${regionId}".`, {
        supportedRegions: referenceData.listRegions().map((r) => r.id),
      });
    }
    return bundle;
  }

  private checkLocation(region: Region, lat: number, lon: number) {
    const d = haversineKm(region.latitude, region.longitude, lat, lon);
    if (d > region.supportRadiusKm) {
      throw new AnalysisError(
        'REGION_NOT_SUPPORTED',
        `This location is about ${Math.round(d)} km from the ${region.shortName} demo area. Demo examples are prepared only within ${region.supportRadiusKm} km.`,
        { distanceKm: Math.round(d), supportRadiusKm: region.supportRadiusKm },
      );
    }
  }

  private loadRotations(regionId: string, currentCrop: string) {
    const bundle = this.loadRegion(regionId);
    const fixture = RotationFixtureSchema.parse(bundle.rotations);
    if (!referenceData.getCrop(currentCrop)) {
      throw new AnalysisError('CROP_NOT_SUPPORTED', `Crop "${currentCrop}" is not in the FieldVerse crop catalogue.`);
    }
    if (!fixture.appliesTo.currentCrops.includes(currentCrop)) {
      const names = fixture.appliesTo.currentCrops.map((c) => referenceData.getCrop(c)?.names.en ?? c).join(', ');
      throw new AnalysisError(
        'CROP_NOT_SUPPORTED',
        `Demo examples for ${bundle.region.shortName} are prepared only for fields currently growing: ${names}. Analysis for other crops will be available when the AI/ML service is connected.`,
        { demoCurrentCrops: fixture.appliesTo.currentCrops },
      );
    }
    return { bundle, fixture };
  }

  private loadScenarios(regionId: string) {
    return ScenarioFixtureSchema.parse(this.loadRegion(regionId).scenarios);
  }

  private findPreset(regionId: string, scenario: ScenarioAssumptions): ScenarioPreset {
    const fixture = this.loadScenarios(regionId);
    const preset = fixture.presets.find((p) => sameScenario(p, scenario));
    if (!preset) {
      throw new AnalysisError(
        'SCENARIO_NOT_SUPPORTED',
        `The demo has prepared examples only for ${fixture.presets.length} scenario presets. Rainfall ${scenario.rainfallChangePercent}% / temperature +${scenario.temperatureChangeCelsius} °C is not one of them. Real analysis of any combination will come from the AI/ML service.`,
        { supportedPresets: fixture.presets },
      );
    }
    return preset;
  }

  private regionSummary(region: Region): RegionSummary {
    return {
      id: region.id,
      name: region.name,
      country: region.country,
      countryCode: region.countryCode,
      latitude: region.latitude,
      longitude: region.longitude,
      agroEcologicalZone: region.agroEcologicalZone ?? null,
    };
  }

  /* ---------------- documented rules ---------------- */

  /** Apply scenario preset effects (prepared text) to baseline strategies. */
  private applyScenario(strategies: Strategy[], regionId: string, preset: ScenarioPreset) {
    const fixture = this.loadScenarios(regionId);
    const effects = fixture.effects[preset.id];
    const changes: StrategyChange[] = [];
    const out = strategies.map((s) => {
      const effect = effects?.strategies[s.id];
      const before = s.feasibility.status;
      if (!effect) {
        changes.push({ strategyId: s.id, direction: preset.id === 'baseline' ? 'unchanged' : 'unknown', feasibilityBefore: before, feasibilityAfter: before, summary: preset.id === 'baseline' ? 'Baseline conditions.' : 'No prepared demo description for this scenario.' });
        return s;
      }
      const next: Strategy = structuredClone(s);
      if (effect.feasibility) {
        next.feasibility = { status: effect.feasibility, reasons: [effect.feasibilityReason ?? effect.summary, ...s.feasibility.reasons] };
      }
      if (effect.suitabilityLevel) next.suitability = { ...next.suitability, level: effect.suitabilityLevel };
      if (effect.indicatorDeltas) {
        next.indicators = next.indicators.map((ind) => {
          const d = effect.indicatorDeltas?.[ind.id];
          return d && ind.rating != null ? { ...ind, rating: clamp(ind.rating + d, 1, 5) } : ind;
        });
      }
      if (effect.addRisk) next.risks = [{ ...effect.addRisk, sourceType: 'demo' }, ...next.risks];
      changes.push({ strategyId: s.id, direction: effect.direction, feasibilityBefore: before, feasibilityAfter: next.feasibility.status, summary: effect.summary });
      return next;
    });
    return { strategies: out, changes, explanation: effects?.explanation ?? [] };
  }

  /**
   * Farmer's Right to Disagree — documented rules (NOT a suitability recalculation):
   *  R1 no_irrigation / irrigation "none": flag steps whose crop water need exceeds the
   *     observed average monthly rain in that season (thresholds in RAIN_NEED_THRESHOLDS_MM).
   *  R2 seeds_unavailable(crop): strategies using that crop become not_feasible.
   *  R3 cannot_sell / crop_failed_before(crop): strategies using that crop need review.
   *  R4 soil_floods: steps with crops of low waterlogging tolerance are flagged.
   *  R5 lacks_equipment: recorded but not assessable in demo mode.
   */
  private applyConstraints(
    strategies: Strategy[],
    constraints: FarmerConstraint[],
    field: Pick<FieldProfile, 'irrigation' | 'waterlogging' | 'excludedCrops'>,
    environment: EnvironmentSummary | null,
    rainfallChangePercent: number,
  ): { strategies: Strategy[]; results: ConstraintResult[] } {
    const all = [...constraints];
    // Farm-profile answers that map onto the same documented rules:
    if (field.irrigation === 'none' && !all.some((c) => c.type === 'no_irrigation')) {
      all.push({ type: 'no_irrigation', note: 'From farm profile: rainfall only.' });
    }
    if (field.waterlogging === 'several_weeks' && !all.some((c) => c.type === 'soil_floods')) {
      all.push({ type: 'soil_floods', note: 'From farm profile: water stands for several weeks in the rainy season.' });
    }
    for (const cropId of field.excludedCrops ?? []) {
      if (!all.some((c) => c.type === 'excluded_crop' && c.cropId === cropId)) all.push({ type: 'excluded_crop', cropId, note: 'From farm profile: crops to exclude.' });
    }
    const results: ConstraintResult[] = [];
    let out = strategies.map((s) => structuredClone(s));
    const cropName = (id: string) => referenceData.getCrop(id)?.names.en ?? id;
    const usesCrop = (s: Strategy, id: string) => s.steps.some((st) => st.cropId === id);

    for (const c of all) {
      switch (c.type) {
        case 'no_irrigation': {
          const monthly = environment?.climate?.monthly;
          if (!monthly) {
            results.push({ constraint: c, handled: false, handling: 'not_supported', message: 'Rainfall data is unavailable, so the irrigation rule could not be applied.' });
            break;
          }
          let flagged = 0;
          out = out.map((s) => {
            for (const step of s.steps) {
              if (step.cropId === 'fallow') continue;
              const crop = referenceData.getCrop(step.cropId);
              const need = crop?.characteristics.waterNeed;
              if (!need || need === 'unknown') continue;
              const months = monthRange(step.season.startMonth, step.season.endMonth);
              const avg = months.reduce((a, m) => a + (monthly[m - 1].rainfallMm ?? 0), 0) / months.length;
              const adjusted = avg * (1 + rainfallChangePercent / 100);
              if (adjusted < RAIN_NEED_THRESHOLDS_MM[need]) {
                flagged++;
                s.feasibility = { status: worse(s.feasibility.status, 'needs_review'), reasons: [...s.feasibility.reasons] };
                const msg = `${cropName(step.cropId)} in ${step.season.name} (${MONTH_NAMES[step.season.startMonth - 1]}–${MONTH_NAMES[step.season.endMonth - 1]}) usually needs irrigation here: average rain is about ${Math.round(adjusted)} mm/month (NASA POWER${rainfallChangePercent ? `, adjusted ${rainfallChangePercent}%` : ''}), below the ${RAIN_NEED_THRESHOLDS_MM[need]} mm rule-of-thumb for a ${need}-water crop.`;
                s.feasibility.reasons.unshift(msg);
                s.constraintFlags.push({ constraintType: 'no_irrigation', cropId: step.cropId, effect: 'flagged', message: msg });
              }
            }
            return s;
          });
          results.push({
            constraint: c,
            handled: true,
            handling: 'rule',
            message: flagged
              ? `Flagged ${flagged} crop step(s) that rely on more water than the observed rainfall usually provides. This is a simple documented rule, not a recalculated suitability.`
              : 'No crop steps fell below the rainfall rule-of-thumb, but dry spells can still occur.',
          });
          break;
        }
        case 'seeds_unavailable':
        case 'excluded_crop':
        case 'cannot_sell':
        case 'crop_failed_before': {
          const id = c.cropId!;
          const status: FeasibilityStatus = c.type === 'seeds_unavailable' || c.type === 'excluded_crop' ? 'not_feasible' : 'needs_review';
          const reason =
            c.type === 'excluded_crop'
              ? `You chose not to grow ${cropName(id)}, so this option is not recommended.`
              : c.type === 'seeds_unavailable'
              ? `You told us ${cropName(id)} seed is not available.`
              : c.type === 'cannot_sell'
                ? `You told us you cannot sell ${cropName(id)} locally.`
                : `You told us ${cropName(id)} has failed on this land before.`;
          let n = 0;
          out = out.map((s) => {
            if (!usesCrop(s, id)) return s;
            n++;
            s.feasibility = { status: worse(s.feasibility.status, status), reasons: [reason, ...s.feasibility.reasons] };
            s.constraintFlags.push({ constraintType: c.type, cropId: id, effect: status === 'not_feasible' ? 'excluded' : 'flagged', message: reason });
            return s;
          });
          results.push({ constraint: c, handled: true, handling: 'rule', message: n ? `${n} strategy(ies) using ${cropName(id)} were ${status === 'not_feasible' ? 'marked not feasible' : 'marked for review'}.` : `None of the strategies use ${cropName(id)}.` });
          break;
        }
        case 'soil_floods': {
          let n = 0;
          out = out.map((s) => {
            const sensitive = s.steps.filter((st) => st.cropId !== 'fallow' && referenceData.getCrop(st.cropId)?.characteristics.waterloggingTolerance === 'low');
            if (!sensitive.length) return s;
            n++;
            const names = [...new Set(sensitive.map((st) => cropName(st.cropId)))].join(', ');
            const msg = `Your soil often floods; ${names} generally tolerate${sensitive.length === 1 ? 's' : ''} waterlogging poorly.`;
            s.feasibility = { status: worse(s.feasibility.status, 'needs_review'), reasons: [msg, ...s.feasibility.reasons] };
            s.constraintFlags.push({ constraintType: 'soil_floods', effect: 'flagged', message: msg });
            return s;
          });
          results.push({ constraint: c, handled: true, handling: 'rule', message: n ? `${n} strategy(ies) include crops that dislike waterlogging and were marked for review.` : 'No strategies include crops known to be sensitive to waterlogging.' });
          break;
        }
        case 'lacks_equipment': {
          out = out.map((s) => {
            s.constraintFlags.push({ constraintType: 'lacks_equipment', effect: 'noted', message: 'Equipment needs were not assessed in demo mode.' });
            return s;
          });
          results.push({ constraint: c, handled: false, handling: 'not_supported', message: 'The demo cannot assess equipment needs. This will need the AI/ML service or an extension officer.' });
          break;
        }
      }
    }
    return { strategies: out, results };
  }

  /** Documented rule: weight the illustrative indicator ratings by the farmer's priorities to ORDER strategies. */
  private rankByPriorities(strategies: Strategy[], p: Priorities): Strategy[] {
    const get = (s: Strategy, id: string) => {
      const ind = s.indicators.find((i) => i.id === id);
      if (!ind || ind.rating == null) return null;
      return ind.direction === 'lower_is_better' ? 6 - ind.rating : ind.rating;
    };
    const avg = (...xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const weights: [number, (s: Strategy) => number | null][] = [
      [p.water, (s) => get(s, 'water_demand')],
      [p.soilHealth, (s) => avg(get(s, 'soil_cover'), get(s, 'nitrogen_contribution'))],
      [p.risk, (s) => get(s, 'climate_risk')],
      [p.income, (s) => get(s, 'income_opportunity')],
      [p.idleLand ?? 0, (s) => get(s, 'soil_cover')],
    ];
    const scored = strategies.map((s) => {
      let total = 0;
      let wsum = 0;
      for (const [w, f] of weights) {
        const v = f(s);
        if (v == null || w <= 0) continue;
        total += w * v;
        wsum += w;
      }
      const penalty = s.feasibility.status === 'not_feasible' ? 100 : 0;
      return { s, score: (wsum ? total / wsum : 0) - penalty };
    });
    const order = [...scored].sort((a, b) => b.score - a.score);
    return strategies.map((s) => {
      const rank = order.findIndex((o) => o.s.id === s.id) + 1;
      return {
        ...s,
        priorityFit: {
          rank,
          method: 'rule' as const,
          explanation: `Ranked ${rank} of ${strategies.length} for your priorities using a simple documented rule that weights the illustrative ratings. This is not a model prediction.`,
        },
      };
    });
  }

  private buildStrategies(req: RotationComparisonRequest | ClimateScenarioRequest, environment: EnvironmentSummary | null, preset: ScenarioPreset) {
    const { fixture } = this.loadRotations(req.regionId, req.field.currentCrop);
    const envSourceIds = environment
      ? [environment.climate?.sourceId, environment.soil?.sourceId].filter((x): x is string => !!x)
      : [];
    const baseline: Strategy[] = fixture.strategies.map((s) =>
      StrategySchema.parse({ ...s, constraintFlags: [], sourceIds: [DEMO_SOURCE.id, CROP_REFERENCE_SOURCE.id, ...envSourceIds] }),
    );
    const scenario = this.applyScenario(baseline, req.regionId, preset);
    const constrained = this.applyConstraints(scenario.strategies, req.constraints, req.field, environment, preset.rainfallChangePercent);
    const ranked = this.rankByPriorities(constrained.strategies, req.priorities);

    // Recompute change summaries after constraints so before/after reflects what the farmer sees.
    const baseFeas = new Map(baseline.map((s) => [s.id, s.feasibility.status]));
    const changes = scenario.changes.map((c) => ({ ...c, feasibilityBefore: baseFeas.get(c.strategyId)!, feasibilityAfter: ranked.find((s) => s.id === c.strategyId)!.feasibility.status }));
    return { strategies: ranked, constraintResults: constrained.results, changes, scenarioExplanation: scenario.explanation, fixture };
  }

  private limitations(extra: string[], constraintResults: ConstraintResult[], req?: { field: FieldProfile; priorities: Priorities }) {
    const out = [
      'DEMO MODE: no machine-learning model was used. Strategies and ratings are illustrative fixtures prepared by the FieldVerse team.',
      ...extra,
    ];
    if (constraintResults.some((r) => r.handling === 'rule')) {
      out.push('Your corrections were applied with simple documented rules (for example, comparing crop water needs with observed rainfall). Crop suitability was not recalculated.');
    }
    // Be explicit about answers the demo examples cannot use yet (the AI/ML service will).
    if (req) {
      const unused: string[] = [];
      const f = req.field;
      if (f.harvestMonth != null) unused.push('expected harvest month');
      if (f.nextPlantingMonth != null) unused.push('next planting month');
      if (f.seasonsPerYear != null) unused.push('seasons per year');
      if (f.inputLevel && f.inputLevel !== 'unknown') unused.push('input level');
      if (f.waterlogging === 'few_days') unused.push('short standing water');
      if ((req.priorities.foodSecurity ?? 0) > 0) unused.push('household food security priority');
      if (unused.length) out.push(`Recorded but not used by the demo examples: ${unused.join(', ')}. These answers are sent to the AI/ML analysis service when it is connected.`);
    }
    return out;
  }

  /* ---------------- AnalysisProvider ---------------- */
  async getModelInfo(): Promise<ModelInfo> {
    const regions = referenceData.listRegions();
    const presets = regions.length ? ScenarioFixtureSchema.parse(referenceData.getBundle(regions[0].id)!.scenarios).presets : [];
    return {
      schemaVersion: SCHEMA_VERSION,
      provider: 'demo',
      name: 'FieldVerse Demo Analysis Adapter (illustrative fixtures — no ML)',
      modelVersion: null,
      status: 'ready',
      capabilities: { rotationComparison: true, climateScenario: true, gapAnalysis: true, constraints: 'rules', scenarioInput: 'presets' },
      supportedRegions: regions.map((r) => r.id),
      supportedCrops: referenceData.listCrops().map((c) => c.id),
      scenarioPresets: presets,
      trainingDataSummary: null,
      lastUpdated: null,
      notes: 'Returns prepared demonstration content only. Replace with ANALYSIS_PROVIDER=remote once the AI/ML FastAPI service is available.',
    };
  }

  async compareRotations(req: RotationComparisonRequest): Promise<RotationComparisonResponse> {
    const bundle = this.loadRegion(req.regionId);
    this.checkLocation(bundle.region, req.field.latitude, req.field.longitude);
    const env = referenceData.getEnvironment(req.regionId);
    const preset = this.findPreset(req.regionId, req.scenario);
    const built = this.buildStrategies(req, env?.environment ?? null, preset);

    const response: RotationComparisonResponse = {
      schemaVersion: SCHEMA_VERSION,
      requestId: randomUUID(),
      mode: 'demo',
      modelVersion: null,
      analysisType: 'rotation_comparison',
      region: this.regionSummary(bundle.region),
      environment: env?.environment ?? null,
      scenario: { ...req.scenario, presetId: preset.id, label: preset.label },
      strategies: built.strategies,
      constraintsApplied: built.constraintResults,
      limitations: this.limitations(built.fixture.limitations, built.constraintResults, req),
      dataSources: [...(env?.dataSources ?? []), DEMO_SOURCE, CROP_REFERENCE_SOURCE],
      disclaimer: DISCLAIMER,
      generatedAt: new Date().toISOString(),
    };
    return RotationComparisonResponseSchema.parse(response);
  }

  async analyzeScenario(req: ClimateScenarioRequest): Promise<ClimateScenarioResponse> {
    const bundle = this.loadRegion(req.regionId);
    this.checkLocation(bundle.region, req.field.latitude, req.field.longitude);
    const env = referenceData.getEnvironment(req.regionId);
    const preset = this.findPreset(req.regionId, req.scenario);
    const baselinePreset = this.findPreset(req.regionId, { rainfallChangePercent: 0, temperatureChangeCelsius: 0 });
    const built = this.buildStrategies(req, env?.environment ?? null, preset);

    const hl = env?.environment.highlights;
    const baseRain = hl?.annualRainfallMm?.value ?? null;
    const baseTemp = hl?.meanTemperatureC?.value ?? null;
    const response: ClimateScenarioResponse = {
      schemaVersion: SCHEMA_VERSION,
      requestId: randomUUID(),
      mode: 'demo',
      modelVersion: null,
      analysisType: 'climate_scenario',
      region: this.regionSummary(bundle.region),
      baseline: { rainfallChangePercent: 0, temperatureChangeCelsius: 0, presetId: baselinePreset.id, label: baselinePreset.label },
      modified: { ...req.scenario, presetId: preset.id, label: preset.label },
      climateContext: {
        baselineAnnualRainfallMm: baseRain,
        hypotheticalAnnualRainfallMm: baseRain == null ? null : Math.round(baseRain * (1 + req.scenario.rainfallChangePercent / 100)),
        baselineMeanTemperatureC: baseTemp,
        hypotheticalMeanTemperatureC: baseTemp == null ? null : Math.round((baseTemp + req.scenario.temperatureChangeCelsius) * 10) / 10,
        note: 'Hypothetical values are simple arithmetic applied to the NASA POWER 2001–2025 average to describe your assumption. They are not a forecast or climate projection.',
      },
      strategies: built.strategies,
      changes: built.changes,
      explanation: preset.id === 'baseline' ? ['This is the observed baseline. Move the sliders to explore a hypothetical change.'] : built.scenarioExplanation,
      constraintsApplied: built.constraintResults,
      limitations: this.limitations(
        [...built.fixture.limitations, 'Scenario effects are prepared descriptions for a few preset combinations, not climate model outputs.'],
        built.constraintResults,
        req,
      ),
      dataSources: [...(env?.dataSources ?? []), DEMO_SOURCE, CROP_REFERENCE_SOURCE],
      disclaimer: DISCLAIMER,
      generatedAt: new Date().toISOString(),
    };
    return ClimateScenarioResponseSchema.parse(response);
  }

  async analyzeGaps(req: GapAnalysisRequest): Promise<GapAnalysisResponse> {
    const bundle = this.loadRegion(req.regionId);
    this.checkLocation(bundle.region, req.field.latitude, req.field.longitude);
    const fixture = GapFixtureSchema.parse(bundle.gaps);
    const env = referenceData.getEnvironment(req.regionId);
    const monthly = env?.environment.climate?.monthly;

    const windows: IdleWindow[] = groupIdleWindows(req.idleMonths).map((months) => ({
      startMonth: months[0],
      endMonth: months[months.length - 1],
      months,
      rainfallMm: monthly ? Math.round(months.reduce((a, m) => a + (monthly[m - 1].rainfallMm ?? 0), 0)) : null,
      rainfallSourceId: monthly ? env!.environment.climate!.sourceId : null,
    }));

    const candidates: GapCandidate[] = [];
    windows.forEach((w, windowIndex) => {
      const windowDays = Math.round(w.months.length * 30.4);
      for (const c of fixture.candidates) {
        const crop = referenceData.getCrop(c.cropId);
        const dur = crop?.characteristics.durationDays ?? null;
        const fit: GapCandidate['fit'] = !dur ? 'unknown' : dur.max <= windowDays ? 'fits' : dur.min <= windowDays ? 'tight' : 'does_not_fit';
        const fitText =
          fit === 'fits'
            ? `Typical duration (${dur!.min}–${dur!.max} days) fits inside this ${windowDays}-day gap.`
            : fit === 'tight'
              ? `Only the fastest varieties (from ${dur!.min} days) would fit this ${windowDays}-day gap.`
              : fit === 'does_not_fit'
                ? `Typical duration (${dur!.min}–${dur!.max} days) is longer than this ${windowDays}-day gap.`
                : 'Crop duration unknown.';
        candidates.push({
          cropId: c.cropId,
          role: c.role,
          windowIndex,
          durationDays: dur,
          fit,
          fitMethod: 'rule',
          benefits: c.benefits,
          risks: c.risks,
          waterNote:
            w.rainfallMm != null
              ? `About ${w.rainfallMm} mm of rain usually falls in these ${w.months.length} month(s) (NASA POWER average). ${crop?.names.en ?? c.cropId} has a ${crop?.characteristics.waterNeed ?? 'unknown'} water need (general reference).`
              : null,
          explanation: `${c.explanation} ${fitText}`,
          sourceType: 'demo',
        });
      }
      candidates.push({
        cropId: 'fallow',
        role: 'fallow',
        windowIndex,
        durationDays: null,
        fit: 'fits',
        fitMethod: 'rule',
        benefits: ['No seed or labour cost.', 'Gives time for land preparation.'],
        risks: ['Bare soil can erode and weeds can grow.'],
        waterNote: null,
        explanation: 'Leaving land fallow is always a valid choice.',
        sourceType: 'demo',
      });
    });

    const calendarMonths = new Set(fixture.calendar.flatMap((c) => c.months));
    const overlap = req.idleMonths.filter((m) => calendarMonths.has(m));
    const limitations = [
      'DEMO MODE: gap candidates are a hand-picked illustrative list. "Fit" compares typical crop duration with the length of your idle months — a documented rule, not a model prediction.',
      'Crop durations are broad typical ranges; local varieties may differ.',
    ];
    if (overlap.length) {
      limitations.push(`Some months you marked idle (${overlap.map((m) => MONTH_NAMES[m - 1]).join(', ')}) overlap the demo calendar. We used your marking because you know your farm.`);
    }

    const response: GapAnalysisResponse = {
      schemaVersion: SCHEMA_VERSION,
      requestId: randomUUID(),
      mode: 'demo',
      modelVersion: null,
      analysisType: 'gap_analysis',
      region: this.regionSummary(bundle.region),
      currentCalendar: fixture.calendar,
      idleWindows: windows,
      candidates,
      limitations,
      dataSources: [...(env?.dataSources.filter((s) => s.id === env.environment.climate?.sourceId) ?? []), DEMO_SOURCE, CROP_REFERENCE_SOURCE],
      disclaimer: DISCLAIMER,
      generatedAt: new Date().toISOString(),
    };
    return GapAnalysisResponseSchema.parse(response);
  }

  /** Used by the frontend to pre-fill idle months for the demo calendar. */
  getDefaultIdleMonths(regionId: string): number[] {
    return GapFixtureSchema.parse(this.loadRegion(regionId).gaps).defaultIdleMonths;
  }
}
