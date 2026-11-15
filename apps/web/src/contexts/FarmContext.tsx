import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  ClimateScenarioRequestInput,
  FarmerConstraint,
  GapAnalysisRequestInput,
  InputLevel,
  Irrigation,
  Priorities,
  RotationComparisonRequestInput,
  ScenarioAssumptions,
  SoilType,
  Waterlogging,
} from '@fieldverse/contracts';

/**
 * The farmer's current farm profile. Stored only in THIS browser (localStorage) for the
 * public demo — nothing is sent to the database unless the farmer presses "Save".
 */
export interface FarmProfile {
  farmName: string;
  regionId: string;
  latitude: number;
  longitude: number;
  currentCrop: string;
  cropHistory: string[];
  soilType: SoilType;
  soilPh: number | null;
  irrigation: Irrigation;
  /** 1–12, "harvested", or null (I do not know). */
  harvestMonth: number | "harvested" | null;
  /** 1–12 or null (I am not sure). */
  nextPlantingMonth: number | null;
  seasonsPerYear: 1 | 2 | 3 | null;
  waterlogging: Waterlogging;
  inputLevel: InputLevel;
  /** Crops the farmer cannot or does not want to grow. */
  excludedCrops: string[];
  priorities: Priorities;
  constraints: FarmerConstraint[];
  scenario: ScenarioAssumptions;
  idleMonths: number[] | null;
  planAdditions: { cropId: string; months: number[] }[];
  savedFieldId: string | null;
  isDemo: boolean;
}

export const DEFAULT_PRIORITIES: Priorities = { water: 0.4, soilHealth: 0.3, risk: 0.2, income: 0.1, idleLand: 0, foodSecurity: 0 };
export const BASELINE: ScenarioAssumptions = { rainfallChangePercent: 0, temperatureChangeCelsius: 0 };

const KEY = 'fv.farm.v1';

function load(): FarmProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as FarmProfile;
    if (!p.regionId || typeof p.latitude !== 'number') return null;
    // Profiles saved by older versions lack the newer answers: fill them with "I do not know".
    return {
      ...p,
      constraints: p.constraints ?? [],
      planAdditions: p.planAdditions ?? [],
      scenario: p.scenario ?? BASELINE,
      harvestMonth: p.harvestMonth ?? null,
      nextPlantingMonth: p.nextPlantingMonth ?? null,
      seasonsPerYear: p.seasonsPerYear ?? null,
      waterlogging: p.waterlogging ?? "unknown",
      inputLevel: p.inputLevel ?? "unknown",
      excludedCrops: p.excludedCrops ?? [],
      priorities: { ...DEFAULT_PRIORITIES, ...p.priorities },
    };
  } catch {
    return null;
  }
}
function persist(p: FarmProfile | null) {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage may be unavailable (private mode) — the app still works in memory */
  }
}

interface FarmCtx {
  farm: FarmProfile | null;
  setFarm: (p: FarmProfile) => void;
  updateFarm: (patch: Partial<FarmProfile>) => void;
  clearFarm: () => void;
}
const Ctx = createContext<FarmCtx | null>(null);

export function FarmProvider({ children }: { children: ReactNode }) {
  const [farm, setState] = useState<FarmProfile | null>(load);
  const setFarm = useCallback((p: FarmProfile) => {
    setState(p);
    persist(p);
  }, []);
  const updateFarm = useCallback((patch: Partial<FarmProfile>) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, []);
  const clearFarm = useCallback(() => {
    setState(null);
    persist(null);
  }, []);
  const value = useMemo(() => ({ farm, setFarm, updateFarm, clearFarm }), [farm, setFarm, updateFarm, clearFarm]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFarm() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFarm must be used inside FarmProvider');
  return v;
}

/* ---------------- request builders (contract-shaped) ---------------- */
export function fieldOf(p: FarmProfile) {
  return {
    latitude: p.latitude,
    longitude: p.longitude,
    currentCrop: p.currentCrop,
    cropHistory: p.cropHistory,
    soilType: p.soilType,
    soilPh: p.soilPh,
    irrigation: p.irrigation,
    harvestMonth: p.harvestMonth,
    nextPlantingMonth: p.nextPlantingMonth,
    seasonsPerYear: p.seasonsPerYear,
    waterlogging: p.waterlogging,
    inputLevel: p.inputLevel,
    excludedCrops: p.excludedCrops,
  };
}

export function comparisonRequest(p: FarmProfile, scenario: ScenarioAssumptions = BASELINE): RotationComparisonRequestInput {
  return { schemaVersion: '1.0', regionId: p.regionId, field: fieldOf(p), priorities: p.priorities, scenario, constraints: p.constraints, locale: 'en' };
}

export function scenarioRequest(p: FarmProfile, scenario: ScenarioAssumptions): ClimateScenarioRequestInput {
  return { schemaVersion: '1.0', regionId: p.regionId, field: fieldOf(p), priorities: p.priorities, scenario, constraints: p.constraints, locale: 'en' };
}

export function gapRequest(p: FarmProfile, idleMonths: number[]): GapAnalysisRequestInput {
  return { schemaVersion: '1.0', regionId: p.regionId, field: fieldOf(p), idleMonths, locale: 'en' };
}
