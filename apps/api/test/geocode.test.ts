import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { setGeocodeFetch } from '../src/services/geocode';

const app = createApp();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => setGeocodeFetch(null));

describe('GET /geocode (village or town search)', () => {
  it('returns places from Nominatim with an identifying User-Agent and caches repeated searches', async () => {
    const f = vi.fn(async () => json([{ name: 'Kumasi', display_name: 'Kumasi, Ashanti Region, Ghana', lat: '6.6985', lon: '-1.6233', type: 'city' }]));
    setGeocodeFetch(f as unknown as typeof fetch);
    const r = await request(app).get('/api/v1/geocode?q=Kumasi');
    expect(r.status).toBe(200);
    expect(r.body.results[0]).toMatchObject({ name: 'Kumasi', latitude: 6.6985, longitude: -1.6233, kind: 'city' });
    expect(r.body.attribution).toMatch(/OpenStreetMap/);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('nominatim.openstreetmap.org/search');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/FieldVerse/);
    await request(app).get('/api/v1/geocode?q=kumasi');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('validates the query', async () => {
    expect((await request(app).get('/api/v1/geocode?q=a')).status).toBe(400);
    expect((await request(app).get('/api/v1/geocode')).status).toBe(400);
  });

  it('reports an unavailable search service honestly', async () => {
    setGeocodeFetch(vi.fn(async () => json({}, 503)) as unknown as typeof fetch);
    const r = await request(app).get('/api/v1/geocode?q=Nowhere');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('DATA_UNAVAILABLE');
  });
});
