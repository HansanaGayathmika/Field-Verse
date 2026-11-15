import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { HttpAnalysisAdapter, setAnalysisProviderForTests } from '../src/adapters/analysis';

/** HTTP-level tests WITHOUT a database: the public demo must keep working. */
const app = createApp();
const H = { 'X-FieldVerse-Client': '1' };

const compareBody = {
  schemaVersion: '1.0',
  regionId: 'sri-lanka-anuradhapura',
  field: { latitude: 8.3114, longitude: 80.4037, currentCrop: 'rice', irrigation: 'limited' },
  priorities: { water: 0.4, soilHealth: 0.3, risk: 0.2, income: 0.1 },
};

afterEach(() => setAnalysisProviderForTests(null));

describe('status endpoints', () => {
  it('GET /health reports degraded without a database', async () => {
    const r = await request(app).get('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'degraded', database: { status: 'not_configured' }, analysisProvider: 'demo' });
    expect(r.headers['x-request-id']).toBeTruthy();
  });
  it('GET /analysis/status reports the real demo adapter state', async () => {
    const r = await request(app).get('/api/v1/analysis/status');
    expect(r.body).toMatchObject({ provider: 'demo', status: 'ready', modelVersion: null });
    expect(r.body.scenarioPresets.length).toBeGreaterThan(1);
  });
  it('GET /data-sources/status lists NASA POWER and the demo fixtures', async () => {
    const r = await request(app).get('/api/v1/data-sources/status');
    const ids = r.body.sources.map((s: { id: string }) => s.id);
    expect(ids).toContain('nasa-power-climatology');
    expect(ids).toContain('fieldverse-demo-fixtures');
  });
  it('sets security headers', async () => {
    const r = await request(app).get('/api/v1/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});

describe('reference data (fixtures fallback)', () => {
  it('lists three regions with distinct content', async () => {
    const r = await request(app).get('/api/v1/regions');
    expect(r.status).toBe(200);
    expect(r.headers['x-data-origin']).toBe('fixtures');
    expect(r.body.regions.map((x: { id: string }) => x.id).sort()).toEqual(['brazil-mato-grosso', 'kenya-nakuru', 'sri-lanka-anuradhapura']);
  });
  it('returns 404 for unknown region and crop', async () => {
    expect((await request(app).get('/api/v1/regions/nowhere')).status).toBe(404);
    expect((await request(app).get('/api/v1/crops/banana')).body.error.code).toBe('NOT_FOUND');
  });
  it('filters crops by region', async () => {
    const r = await request(app).get('/api/v1/crops?regionId=kenya-nakuru');
    expect(r.body.crops.every((c: { regions: string[] }) => c.regions.includes('kenya-nakuru'))).toBe(true);
  });
  it('serves prepared observations with provenance', async () => {
    const r = await request(app).get('/api/v1/observations?regionId=sri-lanka-anuradhapura');
    expect(r.status).toBe(200);
    expect(r.body.environment.climate.monthly).toHaveLength(12);
    expect(r.body.environment.climate.sourceType).toBe('observed');
    expect(r.body.dataSources[0].retrievedAt).toBeTruthy();
  });
  it('validates the observations query', async () => {
    expect((await request(app).get('/api/v1/observations')).status).toBe(400);
    expect((await request(app).get('/api/v1/observations?regionId=mars')).body.error.code).toBe('REGION_NOT_SUPPORTED');
  });
});

describe('analysis endpoints (demo provider)', () => {
  it('POST /rotations/compare returns a labelled demo comparison', async () => {
    const r = await request(app).post('/api/v1/rotations/compare').set(H).send(compareBody);
    expect(r.status).toBe(200);
    expect(r.headers['x-analysis-provider']).toBe('demo');
    expect(r.body.mode).toBe('demo');
    expect(r.body.strategies).toHaveLength(3);
  });
  it('rejects invalid input with VALIDATION_ERROR details', async () => {
    const r = await request(app).post('/api/v1/rotations/compare').set(H).send({ ...compareBody, priorities: { water: 9 } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(r.body.error.details)).toBe(true);
  });
  it('rejects malformed JSON', async () => {
    const r = await request(app).post('/api/v1/rotations/compare').set({ ...H, 'Content-Type': 'application/json' }).send('{bad');
    expect(r.status).toBe(400);
  });
  it('POST /rotations/scenario supports presets and explains unsupported combinations', async () => {
    const ok = await request(app).post('/api/v1/rotations/scenario').set(H).send({ ...compareBody, scenario: { rainfallChangePercent: -20, temperatureChangeCelsius: 0 } });
    expect(ok.status).toBe(200);
    expect(ok.body.modified.presetId).toBe('drier');
    const no = await request(app).post('/api/v1/rotations/scenario').set(H).send({ ...compareBody, scenario: { rainfallChangePercent: -30, temperatureChangeCelsius: 1.5 } });
    expect(no.status).toBe(422);
    expect(no.body.error.code).toBe('SCENARIO_NOT_SUPPORTED');
  });
  it('POST /gaps/analyze works', async () => {
    const r = await request(app).post('/api/v1/gaps/analyze').set(H).send({ schemaVersion: '1.0', regionId: compareBody.regionId, field: compareBody.field, idleMonths: [6, 7, 8, 9] });
    expect(r.status).toBe(200);
    expect(r.body.idleWindows[0].months).toEqual([6, 7, 8, 9]);
  });
});

describe('security & database-unavailable behaviour', () => {
  it('rejects state-changing requests without the client header (CSRF)', async () => {
    const r = await request(app).post('/api/v1/rotations/compare').send(compareBody);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CSRF_REJECTED');
  });
  it('rejects disallowed origins', async () => {
    const r = await request(app).post('/api/v1/rotations/compare').set({ ...H, Origin: 'https://evil.example' }).send(compareBody);
    expect(r.status).toBe(403);
  });
  it('field and scenario persistence return 503 DATABASE_UNAVAILABLE without MongoDB', async () => {
    expect((await request(app).get('/api/v1/fields')).body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect((await request(app).post('/api/v1/scenarios').set(H).send({})).status).toBe(503);
  });
  it('unknown routes return a JSON 404', async () => {
    const r = await request(app).get('/api/v1/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});

describe('remote provider failure handling (no silent fallback)', () => {
  it('returns an explicit error offering demo, and only serves demo when explicitly requested', async () => {
    setAnalysisProviderForTests(new HttpAnalysisAdapter({ baseUrl: 'http://ml.invalid', timeoutMs: 200, fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')) }));
    const r = await request(app).post('/api/v1/rotations/compare').set(H).send(compareBody);
    expect(r.status).toBe(503);
    expect(r.body.error).toMatchObject({ code: 'ANALYSIS_UNAVAILABLE', details: { demoFallbackAvailable: true } });

    const demo = await request(app).post('/api/v1/rotations/compare').set({ ...H, 'X-Analysis-Mode': 'demo' }).send(compareBody);
    expect(demo.status).toBe(200);
    expect(demo.body.mode).toBe('demo');
    expect(demo.headers['x-analysis-provider']).toBe('demo');
  });
  it('analysis status reports the remote service as unavailable', async () => {
    setAnalysisProviderForTests(new HttpAnalysisAdapter({ baseUrl: 'http://ml.invalid', timeoutMs: 200, fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')) }));
    const r = await request(app).get('/api/v1/analysis/status');
    expect(r.body.status).toBe('unavailable');
  });
});
