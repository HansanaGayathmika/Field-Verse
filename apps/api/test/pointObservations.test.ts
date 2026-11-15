import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { setObservationFetch } from '../src/services/pointObservations';

/** Live (worldwide) observations, with NASA POWER and SoilGrids mocked. */
const app = createApp();
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const climatology = {
  header: { fill_value: -999, range: '25-year climatology (January 2001 - December 2025)', api: { version: 'v2.10' }, sources: ['MERRA2'] },
  properties: {
    parameter: {
      PRECTOTCORR: Object.fromEntries(MONTHS.map((m, i) => [m, i < 6 ? 5 : 1])),
      T2M: Object.fromEntries(MONTHS.map((m) => [m, 25])),
      T2M_MAX: Object.fromEntries(MONTHS.map((m) => [m, 31])),
      T2M_MIN: Object.fromEntries(MONTHS.map((m) => [m, 20])),
    },
  },
};
const monthly = {
  header: { fill_value: -999, api: { version: 'v2.10' }, sources: ['MERRA2'] },
  properties: {
    parameter: {
      PRECTOTCORR_SUM: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`${2015 + i}13`, 1000 + i * 10])),
      T2M: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`${2015 + i}13`, 25])),
    },
  },
};
const soil = {
  properties: {
    layers: [
      { name: 'phh2o', depths: ['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm'].map((label) => ({ label, values: { mean: 62, 'Q0.05': 50, 'Q0.95': 75 } })) },
      { name: 'soc', depths: ['0-5cm'].map((label) => ({ label, values: { mean: 150 } })) },
    ],
  },
};

function fakeFetch(opts: { soilFails?: boolean; powerFails?: boolean } = {}) {
  return vi.fn(async (url: string) => {
    if (url.includes('climatology')) return opts.powerFails ? json({}, 500) : json(climatology);
    if (url.includes('temporal/monthly')) return opts.powerFails ? json({}, 500) : json(monthly);
    if (url.includes('soilgrids')) {
      if (opts.soilFails) throw new Error('timeout');
      return json(soil);
    }
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

afterEach(() => setObservationFetch(null));

describe('GET /observations/point (worldwide)', () => {
  it('returns live observed climate + estimated soil, rounding coordinates to ~1 km', async () => {
    const f = fakeFetch();
    setObservationFetch(f);
    const r = await request(app).get('/api/v1/observations/point?lat=7.951234&lon=-1.023456');
    expect(r.status).toBe(200);
    expect(r.body.regionId).toBe('custom');
    expect(r.body.environment.location).toEqual({ latitude: 7.95, longitude: -1.02 });
    expect(r.body.environment.climate.sourceType).toBe('observed');
    expect(r.body.environment.climate.monthly[0].rainfallMm).toBe(155); // 5 mm/day × 31 days
    expect(r.body.environment.soil.layers[0].values.phH2O).toBe(6.2);
    expect(r.body.environment.vegetation).toBeNull();
    // privacy: only rounded coordinates leave the server
    for (const [url] of f.mock.calls) expect(String(url)).toMatch(/(lat|latitude)=7\.95(&|$)/);
  });

  it('caches results for the same ~1 km cell', async () => {
    const f = fakeFetch();
    setObservationFetch(f);
    await request(app).get('/api/v1/observations/point?lat=10.001&lon=10.001');
    await request(app).get('/api/v1/observations/point?lat=10.004&lon=9.998');
    expect(f.mock.calls.length).toBe(3); // climatology + monthly + soil, once
  });

  it('still answers when SoilGrids fails (soil shown as unavailable)', async () => {
    setObservationFetch(fakeFetch({ soilFails: true }));
    const r = await request(app).get('/api/v1/observations/point?lat=20&lon=20');
    expect(r.status).toBe(200);
    expect(r.body.environment.soil).toBeNull();
    expect(r.body.environment.highlights.topsoilPh.sourceType).toBe('unavailable');
  });

  it('returns DATA_UNAVAILABLE when NASA POWER fails — never invented numbers', async () => {
    setObservationFetch(fakeFetch({ powerFails: true }));
    const r = await request(app).get('/api/v1/observations/point?lat=30&lon=30');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('DATA_UNAVAILABLE');
  });

  it('validates coordinates', async () => {
    expect((await request(app).get('/api/v1/observations/point?lat=91&lon=0')).status).toBe(400);
    expect((await request(app).get('/api/v1/observations/point?lon=0')).status).toBe(400);
  });

  it('analysis for a custom location is honestly refused by the demo provider', async () => {
    const r = await request(app)
      .post('/api/v1/rotations/compare')
      .set('X-FieldVerse-Client', '1')
      .send({ schemaVersion: '1.0', regionId: 'custom', field: { latitude: 7.95, longitude: -1.02, currentCrop: 'cassava' }, priorities: { water: 1, soilHealth: 0, risk: 0, income: 0 } });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: 'REGION_NOT_SUPPORTED', details: { customLocation: true } });
  });
});
