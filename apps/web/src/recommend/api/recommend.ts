/**
 * The ONLY place the UI talks to the recommendation engine.
 *
 *   VITE_RECOMMEND_MODE=mock (default)  → returns a real engine output from src/mocks/fixtures after a 1–2 s delay
 *   VITE_RECOMMEND_MODE=live            → POST /api/v1/recommend (FieldVerse API, which forwards to the ML service),
 *                                         or {VITE_RECOMMEND_API_URL}/api/recommend when that URL is set (engine directly)
 *
 * Switching to the real engine is a one-line .env change. Nothing else in the UI needs to know.
 */
import { normaliseRecommendation } from '../normalise';
import type { FarmerInput, Recommendation } from '../types';

export const RECOMMEND_MODE: 'mock' | 'live' = import.meta.env.VITE_RECOMMEND_MODE === 'live' ? 'live' : 'mock';
const API_BASE = String(import.meta.env.VITE_RECOMMEND_API_URL ?? '').replace(/\/+$/, '');
const RECOMMEND_URL = API_BASE ? `${API_BASE}/api/recommend` : '/api/v1/recommend';
const TIMEOUT_MS = 30_000;

/* ------------------------------ errors ------------------------------ */
export type RecommendErrorKind = 'network' | 'invalid_input' | 'server' | 'bad_response';
export class RecommendError extends Error {
  constructor(
    public kind: RecommendErrorKind,
    message: string,
    public status?: number,
    /** For 422: the engine's `{ detail }` text, safe to show. */
    public detail?: string,
  ) {
    super(message);
    this.name = 'RecommendError';
  }
}

/* ------------------------------ mock mode ------------------------------ */
const fixtureLoaders = import.meta.glob<unknown>('../../mocks/fixtures/outputs/*.json', { import: 'default' });
const inputLoaders = import.meta.glob<unknown>('../../mocks/fixtures/inputs/*.json', { import: 'default' });
const nameOf = (path: string) =>
  path
    .split('/')
    .pop()!
    .replace(/\.json$/, '');

/** Every fixture available in mock mode (for the dev-only picker and tests). */
export const FIXTURE_NAMES: string[] = Object.keys(fixtureLoaders).map(nameOf).sort();

/** Pilot locations → the fixture that represents them. */
const PILOTS = [
  { fixture: 'LK_rainfed_smallholder', lat: 8.26, lon: 80.21 }, // Sri Lanka
  { fixture: 'KE_Njoro_maize_farmer', lat: -0.33, lon: 35.94 }, // Kenya
  { fixture: 'BR_Sorriso_soy_farmer', lat: -12.56, lon: -55.72 }, // Brazil
];

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The fixture whose pilot location is nearest to the farmer's field. */
export function nearestFixture(location: { lat: number; lon: number }): string {
  return PILOTS.reduce((best, p) => (distanceKm(location, p) < distanceKm(location, best) ? p : best)).fixture;
}

export async function loadFixture(name: string): Promise<unknown> {
  const load = fixtureLoaders[`../../mocks/fixtures/outputs/${name}.json`];
  if (!load) throw new RecommendError('bad_response', `Unknown fixture "${name}"`);
  return load();
}

/** The farmer answers that produced a fixture (useful for demos and tests). */
export async function loadFixtureInput(name: string): Promise<FarmerInput | null> {
  const load = inputLoaders[`../../mocks/fixtures/inputs/${name}.json`];
  return load ? ((await load()) as FarmerInput) : null;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/* ------------------------------ public API ------------------------------ */
export interface RecommendOptions {
  /** Mock mode only: use this fixture instead of the nearest pilot (dev picker, tests). */
  fixture?: string;
  /** Mock mode only: simulated network delay. Defaults to a random 1–2 s. */
  delayMs?: number;
  signal?: AbortSignal;
}

export async function getRecommendation(input: FarmerInput, opts: RecommendOptions = {}): Promise<Recommendation> {
  const { lat, lon } = input.location ?? ({} as FarmerInput['location']);
  if (!(Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180)) {
    throw new RecommendError('invalid_input', 'The field location is missing or outside the valid range.', undefined, 'Please choose a valid field location.');
  }

  if (RECOMMEND_MODE === 'mock') {
    await wait(opts.delayMs ?? 1000 + Math.random() * 1000, opts.signal);
    return normaliseRecommendation(await loadFixture(opts.fixture ?? nearestFixture(input.location)));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  opts.signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(RECOMMEND_URL, {
      method: 'POST',
      // Through the FieldVerse API: same-origin + the client header its CSRF check requires.
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(API_BASE ? {} : { 'X-FieldVerse-Client': '1' }) },
      credentials: API_BASE ? 'omit' : 'same-origin',
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new RecommendError(
      'network',
      controller.signal.aborted ? 'The recommendation service took too long to answer.' : 'Could not reach the recommendation service.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 422) {
    let detail = 'Some answers could not be used. Please check them and try again.';
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === 'string' && body.detail.trim()) detail = body.detail;
    } catch {
      /* keep the default text */
    }
    throw new RecommendError('invalid_input', 'The engine rejected the answers (422).', 422, detail);
  }
  if (!res.ok) throw new RecommendError('server', `The recommendation service returned an error (${res.status}).`, res.status);
  try {
    return normaliseRecommendation(await res.json());
  } catch {
    throw new RecommendError('bad_response', 'The recommendation service sent a response we could not read.');
  }
}

/** Live mode: GET /api/health. Mock mode always reports ok. */
export async function checkHealth(): Promise<boolean> {
  if (RECOMMEND_MODE === 'mock') return true;
  try {
    const res = await fetch(API_BASE ? `${API_BASE}/api/health` : '/api/v1/analysis/status');
    return res.ok;
  } catch {
    return false;
  }
}
