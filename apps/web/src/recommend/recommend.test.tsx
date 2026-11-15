import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { normaliseRecommendation } from './normalise';
import { Results } from './results/Results';
import { evidenceStrength, goalsByPriority } from './results/parts';
import { FIXTURE_NAMES, RecommendError, getRecommendation, nearestFixture } from './api/recommend';
import { emptyDraft, isComplete, missingOnStep, toFarmerInput } from './form/draft';
import { CROPS } from './config/crops';
import type { FarmerInput } from './types';

const outputs = import.meta.glob<unknown>('../mocks/fixtures/outputs/*.json', { eager: true, import: 'default' });
const inputs = import.meta.glob<FarmerInput>('../mocks/fixtures/inputs/*.json', { eager: true, import: 'default' });
const name = (p: string) => p.split('/').pop()!.replace('.json', '');
const fixture = (n: string) => normaliseRecommendation(outputs[`../mocks/fixtures/outputs/${n}.json`]);
const fixtureInput = (n: string) => inputs[`../mocks/fixtures/inputs/${n}.json`];

const EXPECTED: Record<string, { status: string; plans: number }> = {
  LK_rainfed_smallholder: { status: 'ok', plans: 3 },
  LK_irrigated_high_input: { status: 'ok', plans: 4 },
  LK_waterlogged_field: { status: 'provisional', plans: 2 },
  LK_no_plan_example: { status: 'single_crop_only', plans: 0 },
  KE_Njoro_maize_farmer: { status: 'ok', plans: 3 },
  KE_Njoro_all_unknown: { status: 'provisional', plans: 4 },
  BR_Sorriso_soy_farmer: { status: 'provisional', plans: 3 },
  UG_no_rain_record: { status: 'provisional', plans: 3 },
};

describe('results render every fixture without crashing', () => {
  it('has all 8 fixtures available to the mock adapter', () => {
    expect(FIXTURE_NAMES).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(outputs).map(name).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [n, exp] of Object.entries(EXPECTED)) {
    it(`${n}: ${exp.status}, ${exp.plans} plan(s)`, () => {
      const rec = fixture(n);
      render(<Results rec={rec} priorities={fixtureInput(n)?.priorities} onChangeAnswers={() => undefined} />);
      const root = screen.getByTestId('results');
      expect(root).toHaveAttribute('data-status', exp.status);
      if (exp.plans === 0) {
        expect(screen.getByTestId('no-plan')).toBeInTheDocument();
        expect(screen.queryAllByTestId('plan-card')).toHaveLength(0);
        // status note + crops considered with their reasons
        expect(screen.getByTestId('no-plan')).toHaveTextContent(rec.status_note);
        expect(screen.getByTestId('no-plan')).toHaveTextContent('excluded by the farmer');
      } else {
        expect(screen.getAllByTestId('plan-card')).toHaveLength(exp.plans);
        expect(screen.getAllByTestId('season-timeline')[0].querySelectorAll('li').length).toBeGreaterThan(0);
      }
      // always shown
      expect(screen.getByTestId('confidence')).toHaveTextContent(`Confidence: ${rec.confidence.level}`);
      expect(screen.getByTestId('result-footer')).toHaveTextContent(rec.disclaimer);
      expect(screen.getByTestId('result-footer')).toHaveTextContent(rec.knowledge_base_version);
      if (exp.status === 'provisional') expect(screen.getByTestId('provisional-banner')).toBeInTheDocument();
      else expect(screen.queryByTestId('provisional-banner')).toBeNull();
    });
  }

  it('shows "No rainfall record nearby" when rainfall is null', () => {
    render(<Results rec={fixture('UG_no_rain_record')} onChangeAnswers={() => undefined} />);
    expect(screen.getByTestId('no-rainfall')).toHaveTextContent('No rainfall record nearby');
    expect(screen.queryByTestId('rain-chart')).toBeNull();
  });

  it('labels goal scores as relative scores, not yields or money', () => {
    render(
      <Results rec={fixture('LK_rainfed_smallholder')} priorities={fixtureInput('LK_rainfed_smallholder').priorities} onChangeAnswers={() => undefined} />,
    );
    const card = screen.getAllByTestId('plan-card')[0];
    expect(card).toHaveTextContent('They are not yields, harvest percentages or money');
    expect(within(card).getByTestId('vs-current')).toHaveTextContent('+40.2 points overall vs repeating your current crop');
  });
});

describe('tolerant reader', () => {
  it('ignores unknown fields and survives missing ones', () => {
    const raw = structuredClone(outputs['../mocks/fixtures/outputs/LK_rainfed_smallholder.json']) as Record<string, any>;
    raw.some_future_field = { x: 1 };
    raw.plans[0].sequence[0].ml_adjusted = true;
    delete raw.warnings;
    delete raw.plans[0].benefits;
    raw.site_profile.rainfall = null;
    const rec = normaliseRecommendation(raw);
    expect(rec.warnings).toEqual([]);
    expect(rec.plans[0].benefits).toEqual([]);
    expect(rec.plans[0].sequence[0].ml_adjusted).toBe(true);
    render(<Results rec={rec} onChangeAnswers={() => undefined} />);
    expect(screen.getAllByTestId('plan-card')).toHaveLength(3);
  });

  it('renders an almost empty response without crashing', () => {
    render(<Results rec={normaliseRecommendation({ status: 'no_valid_rotation' })} onChangeAnswers={() => undefined} />);
    expect(screen.getByTestId('no-plan')).toBeInTheDocument();
  });
});

describe('display rules', () => {
  it('classifies evidence text as strong / moderate / weak', () => {
    expect(evidenceStrength('meta-analysis (peer-reviewed)')).toBe('strong');
    expect(evidenceStrength('heuristic (no price data)')).toBe('weak');
    expect(evidenceStrength('FAO guideline values (the score itself is a heuristic)')).toBe('weak');
    expect(evidenceStrength('uncited rule of thumb')).toBe('weak');
    expect(evidenceStrength('calculation from typical crop durations (starter values)')).toBe('moderate');
  });
  it('orders goals by the farmer priority', () => {
    const order = goalsByPriority({ income: 'very_important', water_saving: 'not_important' });
    expect(order[0]).toBe('income');
    expect(order[order.length - 1]).toBe('water_saving');
  });
});

describe('form → FarmerInput contract', () => {
  it('maps unanswered optional questions to "I do not know"', () => {
    const d = {
      ...emptyDraft(),
      location: { lat: 8.26, lon: 80.21 },
      current_crop: 'maize' as const,
      next_planting_month: null,
      water_access: 'unknown' as const,
    };
    expect(isComplete(d)).toBe(true);
    const input = toFarmerInput(d);
    expect(input).toMatchObject({
      harvest_month: null,
      previous_crop: 'unknown',
      previous_crop_2: 'unknown',
      seasons_per_year: null,
      waterlogging: 'unknown',
      input_level: 'unknown',
      soil_texture: 'unknown',
      soil_ph: null,
      excluded_crops: [],
    });
    expect(Object.values(input.priorities).every((p) => p === 'important')).toBe(true);
  });
  it('produces exactly the keys of the engine input fixtures', () => {
    const d = {
      ...emptyDraft(),
      location: { lat: 1, lon: 2 },
      current_crop: 'unknown' as const,
      next_planting_month: 4,
      water_access: 'rainfall_only' as const,
    };
    expect(Object.keys(toFarmerInput(d)).sort()).toEqual(Object.keys(fixtureInput('LK_rainfed_smallholder')).sort());
  });
  it('blocks only on location, current crop, next planting month, water access and an invalid pH', () => {
    const d = emptyDraft();
    expect(missingOnStep(0, d)).toEqual(['location']);
    expect(missingOnStep(0, { location: { lat: 91, lon: 0 } })).toEqual(['location']);
    expect(missingOnStep(1, d)).toEqual(['current_crop', 'next_planting_month']);
    expect(missingOnStep(2, d)).toEqual(['water_access']);
    expect(missingOnStep(2, { water_access: 'unknown', soil_ph: 12 })).toEqual(['soil_ph']);
    expect(missingOnStep(3, d)).toEqual([]);
  });
  it('uses only crops from the config (no dryland rice or cassava)', () => {
    const ids = CROPS.map((c) => c.id);
    expect(ids).toHaveLength(12);
    expect(ids).not.toContain('cassava');
    expect(ids.some((i) => i.includes('dryland'))).toBe(false);
  });
});

describe('adapter (mock mode)', () => {
  it('picks the nearest pilot fixture', () => {
    expect(nearestFixture({ lat: 7.9, lon: 80.7 })).toBe('LK_rainfed_smallholder');
    expect(nearestFixture({ lat: 0.5, lon: 36.5 })).toBe('KE_Njoro_maize_farmer');
    expect(nearestFixture({ lat: -15, lon: -50 })).toBe('BR_Sorriso_soy_farmer');
  });
  it('returns a fixture, or the one chosen by name', async () => {
    const base = fixtureInput('KE_Njoro_maize_farmer');
    expect((await getRecommendation(base, { delayMs: 0 })).status).toBe('ok');
    expect((await getRecommendation(base, { delayMs: 0, fixture: 'LK_no_plan_example' })).status).toBe('single_crop_only');
  });
  it('rejects an invalid location before sending anything', async () => {
    await expect(getRecommendation({ ...fixtureInput('KE_Njoro_maize_farmer'), location: { lat: 120, lon: 0 } }, { delayMs: 0 })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
  });
});

describe('adapter (live mode)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  const live = async () => {
    vi.stubEnv('VITE_RECOMMEND_MODE', 'live');
    vi.stubEnv('VITE_RECOMMEND_API_URL', 'https://engine.example/');
    vi.resetModules();
    return import('./api/recommend');
  };
  const input = () => fixtureInput('LK_rainfed_smallholder');

  it('POSTs FarmerInput to {base}/api/recommend and normalises the answer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(outputs['../mocks/fixtures/outputs/LK_rainfed_smallholder.json']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const m = await live();
    const rec = await m.getRecommendation(input());
    expect(rec.plans).toHaveLength(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://engine.example/api/recommend');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(input());
  });
  it('turns 422 into invalid_input with the engine detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'lat out of range' }), { status: 422 })),
    );
    const m = await live();
    await expect(m.getRecommendation(input())).rejects.toMatchObject({ kind: 'invalid_input', status: 422, detail: 'lat out of range' });
  });
  it('without an engine URL, goes through the FieldVerse API with its client header', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(outputs['../mocks/fixtures/outputs/LK_rainfed_smallholder.json']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_RECOMMEND_MODE', 'live');
    vi.stubEnv('VITE_RECOMMEND_API_URL', '');
    vi.resetModules();
    const m = await import('./api/recommend');
    await m.getRecommendation(input());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/recommend');
    expect((init.headers as Record<string, string>)['X-FieldVerse-Client']).toBe('1');
  });
  it('turns 5xx into server and network failures into network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 503 })),
    );
    let m = await live();
    await expect(m.getRecommendation(input())).rejects.toMatchObject({ kind: 'server', status: 503 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    m = await live();
    const err = await m.getRecommendation(input()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(m.RecommendError);
    expect((err as RecommendError).kind).toBe('network');
  });
});
