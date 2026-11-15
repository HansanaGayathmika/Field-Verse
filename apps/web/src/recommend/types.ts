/**
 * Contract with the Roots of Tomorrow recommendation engine (Python, built separately).
 * Source of truth: UI_TEAM_PROMPT.md. The UI does no agronomy: it sends FarmerInput and renders Recommendation.
 *
 * Tolerance rules (the backend is still evolving):
 * - Unknown extra fields are allowed everywhere (index signatures) and ignored by the UI.
 * - Anything that might be missing is read defensively (see ./normalise.ts).
 */
import type { CropId } from './config/crops';

export type { CropId };
export type HistoryCrop = CropId | 'fallow' | 'other' | 'unknown';
export type Priority = 'not_important' | 'slightly_important' | 'important' | 'very_important';
export type Goal = 'water_saving' | 'soil_health' | 'risk_reduction' | 'income' | 'fallow_use' | 'food_security';

export const GOALS: Goal[] = ['water_saving', 'soil_health', 'risk_reduction', 'income', 'fallow_use', 'food_security'];
export const PRIORITIES: Priority[] = ['not_important', 'slightly_important', 'important', 'very_important'];

export interface FarmerInput {
  location: { lat: number; lon: number };
  current_crop: HistoryCrop;
  harvest_month: number | 'already_harvested' | null;
  previous_crop: HistoryCrop;
  previous_crop_2: HistoryCrop;
  next_planting_month: number | null;
  seasons_per_year: 1 | 2 | 3 | null;
  water_access: 'rainfall_only' | 'limited_irrigation' | 'reliable_irrigation' | 'unknown';
  waterlogging: 'weeks' | 'days' | 'none' | 'unknown';
  input_level: 'minimal' | 'moderate' | 'high' | 'unknown';
  soil_texture: 'clay' | 'loam' | 'sandy' | 'silt' | 'unknown';
  soil_ph: number | null;
  excluded_crops: CropId[];
  priorities: Record<Goal, Priority>;
}

export interface Source {
  id: string;
  cite: string;
  url: string;
  [k: string]: unknown;
}
export interface Benefit {
  goal: Goal;
  title: string;
  text: string;
  evidence_level: string;
  conditions: string[];
  sources: Source[];
  [k: string]: unknown;
}
export interface SeasonStep {
  season: number;
  plant_month: string;
  crop: CropId;
  crop_name: string;
  suitability_score: number;
  suitability_range: [number, number];
  approx_duration_days: number;
  rain_fit: { ratio: number | null; status: 'good' | 'marginal' | 'poor' | 'not checked' | string };
  notes: string[];
  [k: string]: unknown; // e.g. future `ml_adjusted: true`
}
export interface Plan {
  option: number;
  label: string;
  sequence: SeasonStep[];
  scores: { agronomic_fit: number; composite: number; goals: Partial<Record<Goal, number>> };
  benefits: Benefit[];
  trade_offs: string[];
  vs_current_practice: null | {
    current_practice_sequence: string[];
    composite_change: number;
    goal_changes: Partial<Record<Goal, number>>;
    note: string;
  };
  [k: string]: unknown;
}
export type RecommendationStatus = 'ok' | 'provisional' | 'no_suitable_crop' | 'single_crop_only' | 'no_valid_rotation';
export interface CropConsidered {
  crop: string;
  eligible_in_seasons: number[];
  suitability_score: number;
  why_not: string[];
  [k: string]: unknown;
}
export interface SiteProfile {
  distance_to_cell_km: number;
  soil: {
    ph: number | null;
    clay_pct: number | null;
    sand_pct: number | null;
    silt_pct: number | null;
    organic_carbon_g_kg: number | null;
    total_nitrogen_g_kg: number | null;
    texture_class: string;
    source: string;
  };
  rainfall: null | { source: string; monthly_mean_mm: number[]; monthly_cv: (number | null)[]; annual_mm: number; wet_months_ge_100mm: number };
  seasons_per_year_used: number;
  season_plan: { season: number; plant_month: string }[];
  [k: string]: unknown;
}
export interface Recommendation {
  status: RecommendationStatus | string;
  status_note: string;
  knowledge_base_version: string;
  confidence: { level: 'High' | 'Medium' | 'Low' | string; score: number; reasons: string[]; note: string };
  assumptions: string[];
  warnings: string[];
  plans: Plan[];
  crops_considered: CropConsidered[];
  site_profile: SiteProfile;
  disclaimer: string;
  sources?: Record<string, { cite: string; url: string }>;
  [k: string]: unknown;
}

/** Statuses for which the engine returns no plan cards. */
export const NO_PLAN_STATUSES = ['no_suitable_crop', 'single_crop_only', 'no_valid_rotation'];
