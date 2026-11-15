import { lazy, Suspense, useState } from 'react';
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { useRT } from '../i18n';
import { Question } from './controls';
import { validLat, validLon, type Draft } from './draft';

// Re-uses the existing world map (read-only). It is lazy so the form opens quickly on slow connections.
const RegionMap = lazy(() => import('@/features/explore/RegionMap'));

type GeoResult = { label: string; latitude: number; longitude: number };
const round = (v: number) => Math.round(v * 1e5) / 1e5;

export function LocationStep({ draft, update, showErrors }: { draft: Draft; update: (d: Draft) => void; showErrors: boolean }) {
  const { t } = useRT();
  const loc = draft.location;
  const set = (lat: number, lon: number) => update({ location: { lat: round(lat), lon: round(lon) } });

  const [geo, setGeo] = useState<'idle' | 'busy' | 'denied' | 'unsupported'>('idle');
  const useMine = () => {
    if (!('geolocation' in navigator)) return setGeo('unsupported');
    setGeo('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set(p.coords.latitude, p.coords.longitude);
        setGeo('idle');
      },
      () => setGeo('denied'),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
    );
  };

  const [q, setQ] = useState('');
  const [search, setSearch] = useState<{ state: 'idle' | 'busy' | 'error'; results: GeoResult[] | null }>({ state: 'idle', results: null });
  const runSearch = async () => {
    if (q.trim().length < 2) return;
    setSearch({ state: 'busy', results: null });
    try {
      const r = await api.geocode(q.trim());
      setSearch({ state: 'idle', results: r.results });
    } catch {
      setSearch({ state: 'error', results: null });
    }
  };

  const [lat, setLat] = useState(loc ? String(loc.lat) : '');
  const [lon, setLon] = useState(loc ? String(loc.lon) : '');
  const latN = Number.parseFloat(lat);
  const lonN = Number.parseFloat(lon);
  const latErr = lat !== '' && !validLat(latN);
  const lonErr = lon !== '' && !validLon(lonN);
  const input = 'mt-1 h-12 w-full rounded-xl border border-forest-900/20 bg-white px-4';

  return (
    <Question
      id="location"
      label={t('location.label')}
      help={t('location.help')}
      error={showErrors && !(loc && validLat(loc.lat) && validLon(loc.lon)) ? t('location.required') : null}
    >
      {loc ? (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 font-semibold text-emerald-700" data-testid="chosen-location">
          <MapPin className="size-5" aria-hidden /> {t('location.chosen')}: {loc.lat.toFixed(4)}, {loc.lon.toFixed(4)}
        </p>
      ) : null}

      <div>
        <Button type="button" size="lg" className="w-full sm:w-auto" onClick={useMine} disabled={geo === 'busy'} data-testid="use-my-location">
          {geo === 'busy' ? <Loader2 className="animate-spin" aria-hidden /> : <Crosshair aria-hidden />}
          {geo === 'busy' ? t('location.locating') : t('location.useMine')}
        </Button>
        {geo === 'denied' || geo === 'unsupported' ? (
          <p role="status" className="mt-2 text-sm text-warning">
            {t(geo === 'denied' ? 'location.geoDenied' : 'location.geoUnsupported')}
          </p>
        ) : null}
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <label className="block font-semibold" htmlFor="rec-search">
          {t('location.search')}
        </label>
        <div className="flex gap-2">
          <input
            id="rec-search"
            className="h-12 min-w-0 flex-1 rounded-xl border border-forest-900/20 bg-white px-4"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('location.searchPlaceholder')}
          />
          <Button type="submit" variant="secondary" size="lg" disabled={search.state === 'busy'}>
            {search.state === 'busy' ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
            <span className="hidden sm:inline">{t('location.searchButton')}</span>
          </Button>
        </div>
        {search.state === 'error' ? <p className="text-sm text-warning">{t('location.searchFailed')}</p> : null}
        {search.results?.length === 0 ? <p className="text-sm text-ink-muted">{t('location.noResults')}</p> : null}
        {search.results?.length ? (
          <ul className="space-y-1">
            {search.results.slice(0, 5).map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-xl border border-forest-900/10 bg-white px-4 py-3 text-left hover:border-emerald-600"
                  onClick={() => {
                    set(r.latitude, r.longitude);
                    setLat(String(round(r.latitude)));
                    setLon(String(round(r.longitude)));
                    setSearch({ state: 'idle', results: null });
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <div className="overflow-hidden rounded-2xl border border-forest-900/10">
        <div className="h-72 sm:h-96">
          <Suspense fallback={<div className="grid size-full place-items-center bg-sky-100 text-ink-muted">…</div>}>
            <RegionMap
              regions={[]}
              selectedId={null}
              custom={loc ? { ...loc, source: 'map' } : null}
              onSelect={() => undefined}
              onPick={(la, lo) => {
                set(la, lo);
                setLat(String(round(la)));
                setLon(String(round(lo)));
              }}
            />
          </Suspense>
        </div>
        <p className="bg-white px-4 py-2 text-xs text-ink-muted">{t('location.mapHelp')}</p>
      </div>

      <div className="rounded-2xl border border-forest-900/10 bg-white p-4">
        <p className="font-semibold">{t('location.coords')}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-semibold">
            {t('location.lat')}
            <input className={input} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-invalid={latErr} data-testid="rec-lat" />
          </label>
          <label className="text-sm font-semibold">
            {t('location.lon')}
            <input className={input} inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} aria-invalid={lonErr} data-testid="rec-lon" />
          </label>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={!validLat(latN) || !validLon(lonN)}
            onClick={() => set(latN, lonN)}
            data-testid="rec-use-coords"
          >
            {t('location.useCoords')}
          </Button>
        </div>
        {latErr ? <p className="mt-2 text-sm text-critical">{t('location.latRange')}</p> : null}
        {lonErr ? <p className="mt-1 text-sm text-critical">{t('location.lonRange')}</p> : null}
      </div>
    </Question>
  );
}
