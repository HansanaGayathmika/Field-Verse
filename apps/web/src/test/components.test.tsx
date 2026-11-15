import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Strategy } from '@fieldverse/contracts';
import { FeasibilityPill, ProvenanceBadge } from '@/components/Provenance';
import { ErrorState } from '@/components/StatusStates';
import { StrategyComparison } from '@/features/charts/StrategyComparison';
import { rainfallTakeaway } from '@/features/charts/ClimateCharts';
import { phWord, textureWord } from '@/features/charts/SoilProfile';
import { PreferencesProvider, usePreferences } from '@/contexts/PreferencesContext';
import { ApiRequestError } from '@/services/api';
import { regionForLocation } from '@/lib/geo';
import { monthRange } from '@/lib/utils';

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PreferencesProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </PreferencesProvider>
    </QueryClientProvider>,
  );
}

describe('provenance & status labels', () => {
  it('always shows text, not colour alone', () => {
    render(<ProvenanceBadge type="demo" />);
    expect(screen.getByText('Illustrative demo')).toBeInTheDocument();
    render(<FeasibilityPill status="needs_review" />);
    expect(screen.getByText('Needs checking')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('offers (but does not apply) a labelled demo fallback when the server allows it', async () => {
    let forced = false;
    function Probe() {
      forced = usePreferences().forceDemo;
      return null;
    }
    wrap(
      <>
        <ErrorState error={new ApiRequestError(503, 'ANALYSIS_UNAVAILABLE', 'down', { demoFallbackAvailable: true })} />
        <Probe />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The analysis service is not available right now.');
    expect(forced).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /labelled demo results/i }));
    expect(forced).toBe(true);
  });
  it('shows a friendly network message', () => {
    wrap(<ErrorState error={new ApiRequestError(0, 'NETWORK_ERROR', 'x')} />);
    expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument();
  });
});

const strat = (id: string, water: number, cover: number): Strategy => ({
  id,
  name: id,
  kind: 'alternative',
  summary: '',
  steps: [{ cropId: 'rice', role: 'main', season: { name: 'Maha', startMonth: 10, endMonth: 2 } }],
  feasibility: { status: 'feasible', reasons: [] },
  suitability: { level: 'medium', score: null, scoreType: 'none', sourceType: 'demo' },
  indicators: [
    { id: 'water_demand', label: 'Water needed', rating: water, direction: 'lower_is_better', ratingType: 'illustrative', sourceType: 'demo', explanation: '' },
    { id: 'soil_cover', label: 'Soil cover', rating: cover, direction: 'higher_is_better', ratingType: 'illustrative', sourceType: 'demo', explanation: '' },
  ],
  water: { relativeDemand: 'similar', notes: [], sourceType: 'demo' },
  soilCover: { monthsCovered: 8, notes: [], sourceType: 'demo' },
  benefits: [],
  risks: [],
  explanation: { summary: '', details: [] },
  dataGaps: [],
  localChecks: [],
  uncertainty: { level: 'high', notes: '' },
  constraintFlags: [],
  sourceIds: [],
});

describe('StrategyComparison', () => {
  it('labels illustrative ratings and normalises "lower is better" so longer bars are always better', () => {
    render(<StrategyComparison strategies={[strat('a', 5, 2), strat('b', 2, 5)]} />);
    expect(screen.getByText('Illustrative demo ratings')).toBeInTheDocument();
    // water 5 (lots of water) → 1/5 goodness; water 2 → 4/5
    expect(screen.getAllByText('1 / 5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('4 / 5').length).toBeGreaterThan(0);
  });
});

describe('data-driven takeaways', () => {
  it('computes wettest and driest months from the data', () => {
    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rainfallMm: [10, 10, 10, 50, 50, 5, 5, 5, 50, 200, 300, 250][i], temperatureMeanC: 25 }));
    const t = rainfallTakeaway(monthly)!;
    expect(t.wet.map((m) => m.month)).toEqual([10, 11, 12]);
    expect(t.dry.map((m) => m.month)).toEqual([6, 7, 8]);
    expect(t.text).toMatch(/Oct, Nov, Dec/);
  });
  it('returns no takeaway when data is incomplete', () => {
    expect(rainfallTakeaway([{ month: 1, rainfallMm: null, temperatureMeanC: null }])).toBeNull();
  });
  it('describes soil in plain words', () => {
    expect(phWord(5.8)).toBe('slightly acidic');
    expect(phWord(null)).toBe('unknown');
    expect(textureWord(45, 20)).toMatch(/clay-rich/);
  });
});

describe('utilities', () => {
  it('monthRange wraps', () => expect(monthRange(11, 1)).toEqual([11, 12, 1]));
  it('regionForLocation detects supported areas', () => {
    const regions = [{ id: 'x', latitude: 0, longitude: 0, supportRadiusKm: 50 }] as never;
    expect(regionForLocation(regions, 0.1, 0.1)?.supported).toBe(true);
    expect(regionForLocation(regions, 5, 5)?.supported).toBe(false);
  });
});
