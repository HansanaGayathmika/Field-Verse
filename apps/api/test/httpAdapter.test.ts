import { describe, expect, it, vi } from 'vitest';
import { RotationComparisonRequestSchema } from '@fieldverse/contracts';
import { HttpAnalysisAdapter } from '../src/adapters/analysis/HttpAnalysisAdapter';
import { DemoAnalysisAdapter } from '../src/adapters/analysis/DemoAnalysisAdapter';

const request = RotationComparisonRequestSchema.parse({
  schemaVersion: '1.0',
  regionId: 'sri-lanka-anuradhapura',
  field: { latitude: 8.3114, longitude: 80.4037, currentCrop: 'rice' },
  priorities: { water: 0.4, soilHealth: 0.3, risk: 0.2, income: 0.1 },
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function validRemoteResponse() {
  const demo = await new DemoAnalysisAdapter().compareRotations(request);
  return { ...demo, mode: 'remote', modelVersion: 'fieldverse-ml-0.1.0' };
}

describe('HttpAnalysisAdapter', () => {
  it('posts the validated request to the configured endpoint and returns a contract-valid response', async () => {
    const body = await validRemoteResponse();
    const fetchImpl = vi.fn().mockResolvedValue(json(200, body));
    const a = new HttpAnalysisAdapter({ baseUrl: 'http://ml:8000/', timeoutMs: 1000, apiKey: 'k', fetchImpl });
    const res = await a.compareRotations(request);
    expect(res.modelVersion).toBe('fieldverse-ml-0.1.0');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://ml:8000/v1/rotations/compare');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body).regionId).toBe('sri-lanka-anuradhapura');
  });

  it('rejects responses that do not match the contract', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { strategies: 'nope' }));
    const a = new HttpAnalysisAdapter({ baseUrl: 'http://ml:8000', timeoutMs: 1000, fetchImpl });
    await expect(a.compareRotations(request)).rejects.toMatchObject({ code: 'ANALYSIS_BAD_RESPONSE', status: 502 });
  });

  it('rejects remote responses that claim demo mode', async () => {
    const body = { ...(await validRemoteResponse()), mode: 'demo' };
    const a = new HttpAnalysisAdapter({ baseUrl: 'http://ml:8000', timeoutMs: 1000, fetchImpl: vi.fn().mockResolvedValue(json(200, body)) });
    await expect(a.compareRotations(request)).rejects.toMatchObject({ code: 'ANALYSIS_BAD_RESPONSE' });
  });

  it('maps the ML error body to API error codes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(422, { error: { code: 'SCENARIO_NOT_SUPPORTED', message: 'nope', details: { x: 1 } } }));
    const a = new HttpAnalysisAdapter({ baseUrl: 'http://ml:8000', timeoutMs: 1000, fetchImpl });
    await expect(a.compareRotations(request)).rejects.toMatchObject({ code: 'SCENARIO_NOT_SUPPORTED', status: 422, message: 'nope' });
  });

  it('reports an unreachable service as ANALYSIS_UNAVAILABLE', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const a = new HttpAnalysisAdapter({ baseUrl: 'http://ml:8000', timeoutMs: 1000, fetchImpl });
    await expect(a.compareRotations(request)).rejects.toMatchObject({ code: 'ANALYSIS_UNAVAILABLE', status: 503 });
  });

  it('times out slow services', async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    );
    const a = new HttpAnalysisAdapter({ baseUrl: 'http://ml:8000', timeoutMs: 50, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(a.compareRotations(request)).rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT', status: 504 });
  });

  it('handles non-JSON responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const a = new HttpAnalysisAdapter({ baseUrl: 'http://ml:8000', timeoutMs: 1000, fetchImpl });
    await expect(a.compareRotations(request)).rejects.toMatchObject({ code: 'ANALYSIS_BAD_RESPONSE' });
  });
});
