import type { Benefit, CropConsidered, Plan, Recommendation, SeasonStep, SiteProfile } from './types';

/**
 * Tolerant reader for engine responses. The backend is still evolving, so:
 * - missing arrays become [], missing strings '', missing numbers NaN (rendered as "—");
 * - unknown extra fields are kept untouched (and ignored by the UI);
 * - nothing here changes the engine's numbers or text (no agronomy in the UI).
 */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => arr(v).map(str).filter(Boolean);

function step(v: unknown): SeasonStep {
  const s = obj(v);
  const range = arr(s.suitability_range);
  const rain = obj(s.rain_fit);
  return {
    ...s,
    season: num(s.season),
    plant_month: str(s.plant_month),
    crop: str(s.crop) as SeasonStep['crop'],
    crop_name: str(s.crop_name),
    suitability_score: num(s.suitability_score),
    suitability_range: [num(range[0]), num(range[1])],
    approx_duration_days: num(s.approx_duration_days),
    rain_fit: { ratio: numOrNull(rain.ratio), status: str(rain.status) || 'not checked' },
    notes: strings(s.notes),
  };
}

function benefit(v: unknown): Benefit {
  const b = obj(v);
  return {
    ...b,
    goal: str(b.goal) as Benefit['goal'],
    title: str(b.title),
    text: str(b.text),
    evidence_level: str(b.evidence_level),
    conditions: strings(b.conditions),
    sources: arr(b.sources).map((x) => {
      const s = obj(x);
      return { ...s, id: str(s.id), cite: str(s.cite), url: str(s.url) };
    }),
  };
}

function plan(v: unknown, i: number): Plan {
  const p = obj(v);
  const scores = obj(p.scores);
  const vs = p.vs_current_practice == null ? null : obj(p.vs_current_practice);
  return {
    ...p,
    option: Number.isFinite(num(p.option)) ? num(p.option) : i + 1,
    label: str(p.label),
    sequence: arr(p.sequence).map(step),
    scores: { agronomic_fit: num(scores.agronomic_fit), composite: num(scores.composite), goals: obj(scores.goals) as Plan['scores']['goals'] },
    benefits: arr(p.benefits).map(benefit),
    trade_offs: strings(p.trade_offs),
    vs_current_practice: vs
      ? {
          current_practice_sequence: strings(vs.current_practice_sequence),
          composite_change: num(vs.composite_change),
          goal_changes: obj(vs.goal_changes) as NonNullable<Plan['vs_current_practice']>['goal_changes'],
          note: str(vs.note),
        }
      : null,
  };
}

function siteProfile(v: unknown): SiteProfile {
  const s = obj(v);
  const soil = obj(s.soil);
  const rain = s.rainfall == null ? null : obj(s.rainfall);
  return {
    ...s,
    distance_to_cell_km: num(s.distance_to_cell_km),
    soil: {
      ph: numOrNull(soil.ph),
      clay_pct: numOrNull(soil.clay_pct),
      sand_pct: numOrNull(soil.sand_pct),
      silt_pct: numOrNull(soil.silt_pct),
      organic_carbon_g_kg: numOrNull(soil.organic_carbon_g_kg),
      total_nitrogen_g_kg: numOrNull(soil.total_nitrogen_g_kg),
      texture_class: str(soil.texture_class),
      source: str(soil.source),
    },
    rainfall:
      rain && arr(rain.monthly_mean_mm).length === 12
        ? {
            source: str(rain.source),
            monthly_mean_mm: arr(rain.monthly_mean_mm).map(num),
            monthly_cv: arr(rain.monthly_cv).map(numOrNull),
            annual_mm: num(rain.annual_mm),
            wet_months_ge_100mm: num(rain.wet_months_ge_100mm),
          }
        : null,
    seasons_per_year_used: num(s.seasons_per_year_used),
    season_plan: arr(s.season_plan).map((x) => {
      const p = obj(x);
      return { season: num(p.season), plant_month: str(p.plant_month) };
    }),
  };
}

export function normaliseRecommendation(raw: unknown): Recommendation {
  const r = obj(raw);
  const c = obj(r.confidence);
  return {
    ...r,
    status: str(r.status) || 'ok',
    status_note: str(r.status_note),
    knowledge_base_version: str(r.knowledge_base_version),
    confidence: { level: str(c.level), score: num(c.score), reasons: strings(c.reasons), note: str(c.note) },
    assumptions: strings(r.assumptions),
    warnings: strings(r.warnings),
    plans: arr(r.plans).map(plan),
    crops_considered: arr(r.crops_considered).map((x): CropConsidered => {
      const cc = obj(x);
      return {
        ...cc,
        crop: str(cc.crop),
        eligible_in_seasons: arr<number>(cc.eligible_in_seasons),
        suitability_score: num(cc.suitability_score),
        why_not: strings(cc.why_not),
      };
    }),
    site_profile: siteProfile(r.site_profile),
    disclaimer: str(r.disclaimer),
  };
}
