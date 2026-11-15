import type { Region } from '@fieldverse/contracts';

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Which prepared region (if any) covers a location. Mirrors the API rule; the API is authoritative. */
export function regionForLocation(regions: Region[], lat: number, lon: number) {
  let best: { region: Region; km: number } | null = null;
  for (const r of regions) {
    const km = haversineKm(lat, lon, r.latitude, r.longitude);
    if (!best || km < best.km) best = { region: r, km };
  }
  return best ? { ...best, supported: best.km <= best.region.supportRadiusKm } : null;
}
