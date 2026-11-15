import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, CheckCircle2, Crosshair, Info, Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import type { GeocodeResult, Region } from '@fieldverse/contracts';
import { api, ApiRequestError } from '@/services/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProvenanceBadge } from '@/components/Provenance';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { NdviTimelapse } from '@/components/NdviTimelapse';
import { CUSTOM_REGION_ID, useObservations, usePointObservations, useRegions } from '@/hooks/queries';
import { usePreferences } from '@/contexts/PreferencesContext';
import { regionForLocation } from '@/lib/geo';
import { formatNumber } from '@/lib/utils';

const RegionMap = lazy(() => import('@/features/explore/RegionMap'));

type GeoState = { status: 'idle' } | { status: 'locating' } | { status: 'error'; message: string };
const round4 = (v: number) => Math.round(v * 10000) / 10000;

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const isDemo = params.get('demo') === '1';
  const regions = useRegions();
  const { lowBandwidth } = usePreferences();
  const [selectedId, setSelectedId] = useState<string | null>(params.get('region'));
  const [custom, setCustom] = useState<{ lat: number; lon: number; source: 'map' | 'gps' | 'typed' | 'search' } | null>(null);
  const [latIn, setLatIn] = useState('');
  const [lonIn, setLonIn] = useState('');
  const [showMap, setShowMap] = useState(!lowBandwidth);
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' });
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => setShowMap(!lowBandwidth), [lowBandwidth]);

  const selected = regions.data?.find((r) => r.id === selectedId) ?? null;
  const customCheck = useMemo(() => (custom && regions.data ? regionForLocation(regions.data, custom.lat, custom.lon) : null), [custom, regions.data]);
  /** A point outside every prepared demo area: live data mode. */
  const customOutside = custom && customCheck && !customCheck.supported ? custom : null;

  const select = (id: string) => {
    setSelectedId(id);
    setCustom(null);
    const next = new URLSearchParams(params);
    next.set('region', id);
    setParams(next, { replace: true });
  };

  const pick = (lat: number, lon: number, source: 'map' | 'gps' | 'typed' | 'search') => {
    const p = { lat: round4(lat), lon: round4(lon), source };
    setCustom(p);
    setLatIn(String(p.lat));
    setLonIn(String(p.lon));
    setInputError(null);
    const check = regions.data ? regionForLocation(regions.data, p.lat, p.lon) : null;
    setSelectedId(check?.supported ? check.region.id : null);
  };

  /** Uses the browser's location only when the farmer presses the button (the browser asks permission). */
  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeo({ status: 'error', message: 'This browser cannot share its location. Tap the map or type the coordinates instead.' });
      return;
    }
    setGeo({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ status: 'idle' });
        pick(pos.coords.latitude, pos.coords.longitude, 'gps');
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was not given. You can still tap your farm on the map or type its coordinates.'
            : err.code === err.TIMEOUT
              ? 'Finding your location took too long. Please try again or tap the map.'
              : 'Your location could not be found. Please tap the map or type the coordinates.';
        setGeo({ status: 'error', message });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const continueToSetup = () => {
    const q = new URLSearchParams();
    if (selected) {
      q.set('region', selected.id);
      if (custom && customCheck?.supported && customCheck.region.id === selected.id) {
        q.set('lat', String(custom.lat));
        q.set('lon', String(custom.lon));
      }
    } else if (customOutside) {
      q.set('region', CUSTOM_REGION_ID);
      q.set('lat', String(customOutside.lat));
      q.set('lon', String(customOutside.lon));
    } else return;
    if (isDemo) q.set('demo', '1');
    navigate(`/setup?${q}`);
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow={isDemo ? 'Demo · Step 1' : 'Global Farm Explorer'}
        title="Where is the farm?"
        intro="Anywhere in the world: tap your farm on the map, use your current location, or type its coordinates. Three demo regions also have prepared examples."
      />
      {regions.isLoading ? <LoadingBlock /> : null}
      {regions.isError ? <ErrorState error={regions.error} onRetry={() => regions.refetch()} /> : null}

      {regions.data ? (
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            {/* Location tools */}
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={useMyLocation} disabled={geo.status === 'locating'} data-testid="use-my-location">
                  {geo.status === 'locating' ? <Loader2 className="animate-spin" aria-hidden /> : <LocateFixed aria-hidden />}
                  {geo.status === 'locating' ? 'Finding your location…' : 'Use my current location'}
                </Button>
                <span className="text-sm text-ink-muted">Your browser will ask for permission. We only use it to place your farm.</span>
              </div>
              {geo.status === 'error' ? (
                <p role="alert" className="mt-3 rounded-xl bg-[#fdf0d5] p-3 text-sm text-[#5c4510]">
                  {geo.message}
                </p>
              ) : null}
            </Card>

            {/* Search by village or town (OpenStreetMap Nominatim, via our server) */}
            <PlaceSearch onPick={(lat, lon) => pick(lat, lon, 'search')} />

            {/* Map (optional for low bandwidth) */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-forest-900/10 px-4 py-2">
                <span className="text-sm font-semibold">Map — tap anywhere to mark your farm</span>
                <Button size="sm" variant="ghost" onClick={() => setShowMap((v) => !v)} aria-pressed={showMap}>
                  {showMap ? 'Hide map (save data)' : 'Show map'}
                </Button>
              </div>
              {showMap ? (
                <div className="h-[360px] sm:h-[460px]" data-testid="explore-map">
                  <Suspense fallback={<LoadingBlock label="Loading map…" className="h-full rounded-none border-0" />}>
                    <RegionMap regions={regions.data} selectedId={selectedId} custom={custom} onSelect={select} onPick={(la, lo) => pick(la, lo, 'map')} />
                  </Suspense>
                </div>
              ) : (
                <p className="p-4 text-sm text-ink-muted">The map is hidden to save data. Use your current location, the coordinates box or the demo list below — they work the same way.</p>
              )}
              {showMap ? (
                <p className="px-4 py-2 text-xs text-ink-muted">
                  Tap anywhere on Earth to place a pin — zoom in to mark your exact field. Green dots are the three demo regions with prepared examples.
                </p>
              ) : null}
            </Card>

            {/* Coordinates */}
            <Card className="p-4">
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const lat = Number(latIn);
                  const lon = Number(lonIn);
                  if (latIn.trim() && lonIn.trim() && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) pick(lat, lon, 'typed');
                  else setInputError('Enter a latitude between −90 and 90 and a longitude between −180 and 180, for example 7.95 and −1.02.');
                }}
              >
                <p className="w-full text-sm font-semibold">
                  <Crosshair className="mr-1 inline size-4" aria-hidden /> Or type coordinates (decimal degrees)
                </p>
                <label className="flex flex-col text-sm">
                  Latitude
                  <input inputMode="decimal" value={latIn} onChange={(e) => setLatIn(e.target.value)} className="mt-1 h-11 w-36 rounded-lg border border-forest-900/20 px-3" placeholder="7.95" data-testid="lat-input" />
                </label>
                <label className="flex flex-col text-sm">
                  Longitude
                  <input inputMode="decimal" value={lonIn} onChange={(e) => setLonIn(e.target.value)} className="mt-1 h-11 w-36 rounded-lg border border-forest-900/20 px-3" placeholder="-1.02" data-testid="lon-input" />
                </label>
                <Button type="submit" variant="secondary" data-testid="check-location">
                  Use these coordinates
                </Button>
              </form>
              {inputError ? (
                <p role="alert" className="mt-2 text-sm font-semibold text-critical">
                  {inputError}
                </p>
              ) : null}
              {customCheck?.supported ? (
                <div role="status" className="mt-3 flex gap-2 rounded-xl bg-emerald-100 p-3 text-sm text-forest-900">
                  <CheckCircle2 className="size-5 shrink-0" aria-hidden />
                  <span>
                    This location is inside the <strong>{customCheck.region.shortName}</strong> demo area ({formatNumber(customCheck.km)} km from its centre). Prepared examples will be used.
                  </span>
                </div>
              ) : null}
            </Card>

          </div>

          <div>
            {selected ? (
              <RegionPanel region={selected} onContinue={continueToSetup} isDemo={isDemo} />
            ) : customOutside ? (
              <CustomLocationPanel lat={customOutside.lat} lon={customOutside.lon} source={customOutside.source} onContinue={continueToSetup} />
            ) : (
              <EmptyPanel />
            )}
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}

/** "Search by village or town" — the spec's alternative to a map pin or current location. */
function PlaceSearch({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<{ status: 'idle' } | { status: 'loading' } | { status: 'done'; results: GeocodeResult[] } | { status: 'error'; message: string }>({ status: 'idle' });
  const search = async () => {
    if (q.trim().length < 2) {
      setState({ status: 'error', message: 'Type at least 2 letters of your village or town.' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const r = await api.geocode(q.trim());
      setState({ status: 'done', results: r.results });
    } catch (e) {
      setState({ status: 'error', message: e instanceof ApiRequestError ? e.message : 'Search failed. Please try again.' });
    }
  };
  return (
    <Card className="p-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        role="search"
      >
        <label htmlFor="place-search" className="w-full text-sm font-semibold">
          <Search className="mr-1 inline size-4" aria-hidden /> Search by village or town
        </label>
        <input
          id="place-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Kumasi, Njoro, Anuradhapura"
          className="h-11 min-w-0 flex-1 rounded-lg border border-forest-900/20 px-3"
          maxLength={120}
          data-testid="place-search-input"
        />
        <Button type="submit" variant="secondary" disabled={state.status === 'loading'} data-testid="place-search-button">
          {state.status === 'loading' ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Search
        </Button>
      </form>
      <div aria-live="polite">
        {state.status === 'error' ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-critical">
            {state.message}
          </p>
        ) : null}
        {state.status === 'done' && state.results.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No places found. Try another spelling, or tap your field on the map.</p> : null}
        {state.status === 'done' && state.results.length ? (
          <ul className="mt-3 divide-y divide-forest-900/10 rounded-xl border border-forest-900/10" data-testid="place-results">
            {state.results.map((r, i) => (
              <li key={`${r.latitude},${r.longitude},${i}`}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-start gap-2 px-3 py-2.5 text-left hover:bg-sage-100"
                  onClick={() => {
                    onPick(r.latitude, r.longitude);
                    setState({ status: 'idle' });
                    setQ(r.name);
                  }}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>
                    <span className="block font-semibold text-forest-900">{r.name}</span>
                    <span className="block text-xs text-ink-muted">{r.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {state.status === 'done' ? <p className="mt-2 text-xs text-ink-muted">Search data © OpenStreetMap contributors (Nominatim). Zoom in on the map to place the pin exactly on your field.</p> : null}
      </div>
    </Card>
  );
}

/** Any location outside the prepared demo areas: real NASA POWER / SoilGrids data fetched live. */
function CustomLocationPanel({ lat, lon, source, onContinue }: { lat: number; lon: number; source: 'map' | 'gps' | 'typed' | 'search'; onContinue: () => void }) {
  const obs = usePointObservations(lat, lon);
  const env = obs.data?.environment;
  const hl = env?.highlights;
  return (
    <Card className="sticky top-20 overflow-hidden" data-testid="custom-panel">
      <div className="p-5 sm:p-6">
        <p className="text-sm font-semibold text-emerald-700">{source === 'gps' ? 'Your current location' : 'Your marked location'}</p>
        <h2 className="mt-1 text-2xl">
          {lat.toFixed(4)}, {lon.toFixed(4)}
        </h2>

        {obs.isLoading ? <LoadingBlock className="mt-4" label="Fetching NASA data for this location…" rows={2} /> : null}
        {obs.isError ? <ErrorState className="mt-4" error={obs.error} onRetry={() => obs.refetch()} /> : null}
        {env ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-cream-100 p-3">
              <dt className="text-ink-muted">Rain per year</dt>
              <dd className="text-lg font-bold">{hl?.annualRainfallMm?.value != null ? `${formatNumber(hl.annualRainfallMm.value)} mm` : 'Not available'}</dd>
            </div>
            <div className="rounded-xl bg-cream-100 p-3">
              <dt className="text-ink-muted">Average temperature</dt>
              <dd className="text-lg font-bold">{hl?.meanTemperatureC?.value != null ? `${formatNumber(hl.meanTemperatureC.value, 'en', 1)} °C` : 'Not available'}</dd>
            </div>
          </dl>
        ) : null}
        <Button size="lg" className="mt-5 w-full" onClick={onContinue} data-testid="continue-setup">
          Continue with this location <ArrowRight aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

function EmptyPanel() {
  return (
    <Card className="grid h-full min-h-64 place-items-center p-8 text-center">
      <div>
        <MapPin className="mx-auto size-10 text-sage-400" aria-hidden />
        <p className="mt-3 font-semibold">Choose a region to see its information</p>
        <p className="text-sm text-ink-muted">Each region shows real NASA observations and what data is available.</p>
      </div>
    </Card>
  );
}

function RegionPanel({ region, onContinue, isDemo }: { region: Region; onContinue: () => void; isDemo: boolean }) {
  const obs = useObservations(region.id);
  const env = obs.data?.environment;
  const tl = env?.media?.ndviTimelapse;
  const statuses: [string, Region['dataStatus'][keyof Region['dataStatus']]][] = [
    ['Rainfall & temperature', env?.climate ? region.dataStatus.climate : obs.isLoading ? region.dataStatus.climate : 'unavailable'],
    ['Soil', env ? (env.soil ? region.dataStatus.soil : 'unavailable') : region.dataStatus.soil],
    ['Vegetation', env ? (env.vegetation ? region.dataStatus.vegetation : 'unavailable') : region.dataStatus.vegetation],
    ['Crop rotations', region.dataStatus.rotations],
    ['Climate scenarios', region.dataStatus.scenarios],
  ];
  return (
    <Card className="sticky top-20 overflow-hidden" data-testid="region-panel">
      <div className="p-5 sm:p-6">
        <p className="text-sm font-semibold text-emerald-700">{region.country}</p>
        <h2 className="mt-1 text-2xl">{region.name}</h2>
        <p className="mt-2 text-ink-muted">{region.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-cream-100 p-3">
            <dt className="text-ink-muted">Rain per year</dt>
            <dd className="text-lg font-bold">{env?.highlights?.annualRainfallMm?.value != null ? `${formatNumber(env.highlights.annualRainfallMm.value)} mm` : '…'}</dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-3">
            <dt className="text-ink-muted">Average temperature</dt>
            <dd className="text-lg font-bold">{env?.highlights?.meanTemperatureC?.value != null ? `${formatNumber(env.highlights.meanTemperatureC.value, 'en', 1)} °C` : '…'}</dd>
          </div>
        </dl>
        <p className="mt-1 text-xs text-ink-muted">NASA POWER, 2001–2025 average.</p>
      </div>
      {tl ? (
        <div className="px-5 sm:px-6">
          <NdviTimelapse webm={tl.webm} mp4={tl.mp4} poster={tl.poster} fps={tl.framesPerSecond} year={tl.year} title={region.shortName} className="max-h-[420px]" showLegend={false} />
        </div>
      ) : null}
      <div className="p-5 sm:p-6">
        <h3 className="mb-2 text-base font-semibold">Data available for this region</h3>
        <ul className="space-y-1.5">
          {statuses.map(([label, st]) => (
            <li key={label} className="flex items-center justify-between gap-2 text-sm">
              <span>{label}</span>
              <ProvenanceBadge type={st} />
            </li>
          ))}
        </ul>
        <p className="mt-3 flex gap-2 text-xs text-ink-muted">
          <Info className="size-4 shrink-0" aria-hidden /> {region.contentSource.note}
        </p>
        <Button size="lg" className="mt-5 w-full" onClick={onContinue} data-testid="continue-setup">
          {isDemo ? 'Continue with demo farm' : 'Continue to farm setup'} <ArrowRight aria-hidden />
        </Button>
        <Link to="/data" className="mt-3 block text-center text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline">
          Where does this data come from?
        </Link>
      </div>
    </Card>
  );
}
