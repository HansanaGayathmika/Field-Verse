import type { GeocodeResult, ResolvedArea } from '@fieldverse/contracts';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Village / town search via OpenStreetMap Nominatim (free, no key).
 * Usage policy: max 1 request per second, identifying User-Agent, attribution, cache results.
 * https://operations.osmfoundation.org/policies/nominatim/
 * Only the search text is sent — never anything about the user.
 */
const UA = 'FieldVerse/0.1 (NASA Space Apps Challenge demo)';
const CACHE_MS = 24 * 3600_000;

let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function setGeocodeFetch(f: typeof fetch | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
  cache.clear();
  areaCache.clear();
  last = 0;
}

const cache = new Map<string, { expires: number; value: GeocodeResult[] }>();
let last = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Serialise outgoing requests so we never exceed 1 request per second. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

/* ------------------------------------------------------------------ */
/* Administrative area for a location (Community: coarse, never coordinates). */
/* ------------------------------------------------------------------ */

/** Country-specific names for administrative levels (generic fallback otherwise). */
const LEVEL_LABELS: Record<string, { admin1: string; admin2: string }> = {
  LK: { admin1: 'Province', admin2: 'District' },
  KE: { admin1: 'County', admin2: 'Sub-county' },
  BR: { admin1: 'State', admin2: 'Municipality' },
  IN: { admin1: 'State', admin2: 'District' },
  GH: { admin1: 'Region', admin2: 'District' },
  NG: { admin1: 'State', admin2: 'Local government area' },
  US: { admin1: 'State', admin2: 'County' },
};
export const levelLabels = (countryCode: string) => LEVEL_LABELS[countryCode] ?? { admin1: 'Region', admin2: 'District' };

const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const areaCache = new Map<string, { expires: number; value: Omit<ResolvedArea, 'areaToken'> }>();

/**
 * Reverse-geocodes a location to country / admin1 / admin2 using OpenStreetMap Nominatim.
 * Codes are ISO 3166 where OSM provides them (e.g. LK-7, LK-71, KE-31, BR-MT); otherwise a
 * deterministic derived code "<parentCode>:<slug>" (e.g. "KE-31:njoro").
 * Coordinates are rounded to 2 decimals (~1 km) before leaving the server and are never stored.
 */
export async function resolveAdminArea(latIn: number, lonIn: number): Promise<Omit<ResolvedArea, 'areaToken'>> {
  const lat = Math.round(latIn * 100) / 100;
  const lon = Math.round(lonIn * 100) / 100;
  const key = `${lat},${lon}`;
  const hit = areaCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`;
  let body: any;
  try {
    body = await throttled<any>(async () => {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as any;
    });
  } catch (err) {
    logger.warn('Reverse geocoding failed', { error: (err as Error).message });
    throw new AppError(503, 'DATA_UNAVAILABLE', 'We could not work out the district for this location right now. Please choose an area from the list instead.');
  }
  const a = body?.address ?? {};
  const countryCode = String(a.country_code ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new AppError(422, 'DATA_UNAVAILABLE', 'This location is not inside a country (for example, it may be in the sea). Please choose your field again.');
  }
  const countryName = String(a.country ?? countryCode);
  const admin1Name: string | null = a.state ?? a.province ?? a.region ?? a.state_district ?? null;
  const admin1Code: string | null = a['ISO3166-2-lvl4'] ?? a['ISO3166-2-lvl3'] ?? (admin1Name ? `${countryCode}:${slugify(admin1Name)}` : null);
  // District-level name: the first of these that exists and differs from admin1.
  const admin2Raw: string | null = [a.state_district, a.county, a.district, a.municipality, a.city, a.town].find((v) => v && v !== admin1Name) ?? null;
  const admin2Name = admin2Raw;
  const admin2Code: string | null = admin2Name ? (a['ISO3166-2-lvl5'] ?? a['ISO3166-2-lvl6'] ?? `${admin1Code ?? countryCode}:${slugify(admin2Name)}`) : null;
  const value: Omit<ResolvedArea, 'areaToken'> = {
    area: { countryCode, countryName, admin1Code, admin1Name, admin2Code, admin2Name },
    levelLabels: levelLabels(countryCode),
  };
  areaCache.set(key, { expires: Date.now() + CACHE_MS * 7, value });
  if (areaCache.size > 2000) areaCache.delete(areaCache.keys().next().value!);
  return value;
}

export async function searchPlaces(qIn: string): Promise<GeocodeResult[]> {
  const q = qIn.trim().replace(/\s+/g, ' ');
  if (q.length < 2 || q.length > 120) throw new AppError(400, 'VALIDATION_ERROR', 'Type 2 to 120 characters to search for a village or town.');
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`;
  let rows: any[];
  try {
    rows = await throttled<any[]>(async () => {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as any[];
    });
  } catch (err) {
    logger.warn('Place search failed', { error: (err as Error).message });
    throw new AppError(503, 'DATA_UNAVAILABLE', 'Place search is not available right now. Please tap your field on the map or type its coordinates.');
  }
  const value: GeocodeResult[] = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      name: String(r.name || String(r.display_name ?? '').split(',')[0] || q),
      label: String(r.display_name ?? ''),
      latitude: Number(r.lat),
      longitude: Number(r.lon),
      kind: r.type ? String(r.type) : null,
    }))
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
  cache.set(key, { expires: Date.now() + CACHE_MS, value });
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  return value;
}
