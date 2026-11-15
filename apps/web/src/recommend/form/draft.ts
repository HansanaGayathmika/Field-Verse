import { useCallback, useEffect, useState } from 'react';
import { GOALS, type FarmerInput, type Goal, type Priority } from '../types';

/**
 * Form draft = FarmerInput where every answer may still be missing (undefined = not answered yet).
 * "I do not know" is a real answer ('unknown' or null), which is why `undefined` is kept separate.
 * Saved to localStorage so a reload (or a lost connection) never loses the farmer's answers.
 */
export type Draft = { [K in keyof FarmerInput]?: FarmerInput[K] };

const DRAFT_KEY = 'fv.recommend.draft.v1';
const INPUT_KEY = 'fv.recommend.input.v1';
const DEV_FIXTURE_KEY = 'fv.recommend.devFixture';

export const defaultPriorities = (): Record<Goal, Priority> => Object.fromEntries(GOALS.map((g) => [g, 'important'])) as Record<Goal, Priority>;
export const emptyDraft = (): Draft => ({ excluded_crops: [], priorities: defaultPriorities() });

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: unknown) {
  try {
    if (value == null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode): the form still works, it just won't survive a reload */
  }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

type Saved = { draft: Draft; step: number };

/** Draft answers + current step, persisted on every change. */
export function useDraft() {
  const [state, setState] = useState<Saved>(() => {
    const saved = read<Saved>(local, DRAFT_KEY);
    return saved?.draft ? { draft: { ...emptyDraft(), ...saved.draft }, step: saved.step ?? 0 } : { draft: emptyDraft(), step: 0 };
  });
  useEffect(() => write(local, DRAFT_KEY, state), [state]);

  const update = useCallback((patch: Draft) => setState((s) => ({ ...s, draft: { ...s.draft, ...patch } })), []);
  const setStep = useCallback((step: number) => setState((s) => ({ ...s, step })), []);
  const replace = useCallback((draft: Draft) => setState({ draft: { ...emptyDraft(), ...draft }, step: 4 }), []);
  const reset = useCallback(() => setState({ draft: emptyDraft(), step: 0 }), []);
  return { draft: state.draft, step: state.step, update, setStep, replace, reset };
}

/* ------------------------------ validation ------------------------------ */
export const validLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90;
export const validLon = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180;
export const validPh = (v: number | null | undefined) => v == null || (Number.isFinite(v) && v >= 3 && v <= 10);

/** Which required questions on a step are still unanswered ("I do not know" counts as answered). */
export function missingOnStep(step: number, d: Draft): (keyof FarmerInput)[] {
  const missing: (keyof FarmerInput)[] = [];
  if (step === 0 && !(d.location && validLat(d.location.lat) && validLon(d.location.lon))) missing.push('location');
  if (step === 1) {
    if (d.current_crop === undefined) missing.push('current_crop');
    if (d.next_planting_month === undefined) missing.push('next_planting_month');
  }
  if (step === 2) {
    if (d.water_access === undefined) missing.push('water_access');
    if (!validPh(d.soil_ph)) missing.push('soil_ph');
  }
  return missing;
}
export const isComplete = (d: Draft) => [0, 1, 2, 3].every((s) => missingOnStep(s, d).length === 0);

/** Draft → the exact JSON the engine expects. Unanswered optional questions become "I do not know". */
export function toFarmerInput(d: Draft): FarmerInput {
  if (!isComplete(d)) throw new Error('The form is not complete');
  return {
    location: { lat: d.location!.lat, lon: d.location!.lon },
    current_crop: d.current_crop!,
    harvest_month: d.harvest_month ?? null,
    previous_crop: d.previous_crop ?? 'unknown',
    previous_crop_2: d.previous_crop_2 ?? 'unknown',
    next_planting_month: d.next_planting_month ?? null,
    seasons_per_year: d.seasons_per_year ?? null,
    water_access: d.water_access!,
    waterlogging: d.waterlogging ?? 'unknown',
    input_level: d.input_level ?? 'unknown',
    soil_texture: d.soil_texture ?? 'unknown',
    soil_ph: d.soil_ph ?? null,
    excluded_crops: d.excluded_crops ?? [],
    priorities: { ...defaultPriorities(), ...d.priorities },
  };
}

/* ------------------------------ last submission ------------------------------ */
export const saveSubmittedInput = (input: FarmerInput) => write(local, INPUT_KEY, input);
export const loadSubmittedInput = () => read<FarmerInput>(local, INPUT_KEY);

/** Remove every answer stored by this module (used when the account changes or the user logs out). */
export function clearRecommendStorage() {
  write(local, DRAFT_KEY, null);
  write(local, INPUT_KEY, null);
  write(session, DEV_FIXTURE_KEY, null);
}

/** Dev-only: which mock fixture to use ('' = nearest pilot). Per browser tab. */
export const loadDevFixture = () => read<string>(session, DEV_FIXTURE_KEY) ?? '';
export const saveDevFixture = (name: string) => write(session, DEV_FIXTURE_KEY, name || null);
