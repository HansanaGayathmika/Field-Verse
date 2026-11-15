import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CloudRain, Info, Pause, Play, Sprout, Thermometer } from 'lucide-react';
import type { Region } from '@fieldverse/contracts';
import { FarmSubnav, PageContainer, PageHeader, RequireFarm } from '@/components/Page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { AnalysisModeNotice, ErrorState, LoadingBlock } from '@/components/StatusStates';
import { FeasibilityPill, ProvenanceBadge } from '@/components/Provenance';
import { cropLabel } from '@/components/CropVisual';
import { RootsScene } from '@/features/roots/RootsScene';
import { RotationTimeline } from '@/features/rotations/RotationTimeline';
import { phWord, textureWord } from '@/features/charts/SoilProfile';
import { CUSTOM_REGION_ID, useAnalysisStatus, useCropMap, useFarmObservations, useRegions, useScenario } from '@/hooks/queries';
import { useFarm, BASELINE, DEFAULT_PRIORITIES, type FarmProfile } from '@/contexts/FarmContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatNumber, MONTHS_SHORT, cn } from '@/lib/utils';

export default function RootsPage() {
  return (
    <RequireFarm>
      <Roots />
    </RequireFarm>
  );
}

/** Demo profile for previewing another region without changing the farmer's saved farm. */
function previewProfile(region: Region): FarmProfile {
  return {
    farmName: region.demoFarm.farmName,
    regionId: region.id,
    latitude: region.latitude,
    longitude: region.longitude,
    currentCrop: region.demoFarm.currentCrop,
    cropHistory: region.demoFarm.cropHistory,
    soilType: region.demoFarm.soilType,
    soilPh: null,
    irrigation: region.demoFarm.irrigation,
    harvestMonth: region.demoFarm.harvestMonth ?? null,
    nextPlantingMonth: region.demoFarm.nextPlantingMonth ?? null,
    seasonsPerYear: (region.demoFarm.seasonsPerYear ?? null) as FarmProfile['seasonsPerYear'],
    waterlogging: 'unknown',
    inputLevel: 'unknown',
    excludedCrops: [],
    priorities: DEFAULT_PRIORITIES,
    constraints: [],
    scenario: BASELINE,
    idleMonths: null,
    planAdditions: [],
    savedFieldId: null,
    isDemo: true,
  };
}

const FALLBACK_PRESETS = [
  { id: 'baseline', label: "Today's climate", rainfallChangePercent: 0, temperatureChangeCelsius: 0 },
  { id: 'drier', label: '20% less rain', rainfallChangePercent: -20, temperatureChangeCelsius: 0 },
  { id: 'hotter', label: '2 °C warmer', rainfallChangePercent: 0, temperatureChangeCelsius: 2 },
  { id: 'hot-dry', label: 'Hotter and drier', rainfallChangePercent: -20, temperatureChangeCelsius: 2 },
];

function Roots() {
  const { farm } = useFarm();
  const { calmMotion } = usePreferences();
  const regions = useRegions();
  const status = useAnalysisStatus();
  const { map } = useCropMap();
  const [regionId, setRegionId] = useState(farm!.regionId);
  const [presetId, setPresetId] = useState('baseline');
  const [strategyIdx, setStrategyIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(!calmMotion);
  const [layer, setLayer] = useState<number | null>(null);

  const region = regions.data?.find((r) => r.id === regionId);
  const profile = useMemo(() => (regionId === farm!.regionId ? farm! : region ? previewProfile(region) : null), [regionId, farm, region]);
  const presets = status.data?.scenarioPresets?.length ? status.data.scenarioPresets : FALLBACK_PRESETS;
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];
  const scenario = { rainfallChangePercent: preset.rainfallChangePercent, temperatureChangeCelsius: preset.temperatureChangeCelsius };
  const q = useScenario(profile, scenario);
  const obs = useFarmObservations(profile);

  const strategies = q.data?.strategies ?? [];
  const strategy = strategies[Math.min(strategyIdx, strategies.length - 1)];
  const step = strategy?.steps[Math.min(stepIdx, strategy.steps.length - 1)];
  const change = q.data?.changes.find((c) => c.strategyId === strategy?.id);

  useEffect(() => setStepIdx(0), [strategyIdx, regionId]);
  useEffect(() => {
    if (!playing || calmMotion || !strategy) return;
    const id = setInterval(() => setStepIdx((i) => (i + 1) % strategy.steps.length), 4500);
    return () => clearInterval(id);
  }, [playing, calmMotion, strategy]);

  const env = obs.data?.environment ?? null;
  const layers = env?.soil?.layers.filter((l) => l.bottomCm <= 100);
  const selLayer = layer != null ? layers?.[layer] : null;
  const crop = step && step.cropId !== 'fallow' ? (map.get(step.cropId) ?? null) : null;
  const months = step ? (() => {
    const out: number[] = [];
    let m = step.season.startMonth;
    for (let i = 0; i < 12; i++) { out.push(m); if (m === step.season.endMonth) break; m = (m % 12) + 1; }
    return out;
  })() : [];
  const avgRain = env?.climate && months.length ? months.reduce((a, m) => a + (env.climate!.monthly[m - 1].rainfallMm ?? 0), 0) / months.length : null;

  return (
    <PageContainer>
      <FarmSubnav />
      <PageHeader
        eyebrow="Roots of Tomorrow"
        title="See your field above and below the ground"
        intro="Choose an option and watch it move through the seasons. The sky follows real rainfall, and the soil shows real soil estimates for this area."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <Info aria-hidden /> How to read this scene
              </Button>
            </DialogTrigger>
            <DialogContent title="How to read Roots of Tomorrow">
              <ul className="list-disc space-y-2 pl-5 text-[0.95rem]">
                <li>
                  <strong>Rain</strong> — the number of raindrops follows the observed average rain in the months of the selected season (NASA POWER), changed by your climate choice.
                </li>
                <li>
                  <strong>Sky colour and sun</strong> — warmer choices make the sky warmer. This is a visual cue only.
                </li>
                <li>
                  <strong>Soil layers</strong> — real SoilGrids estimates from 0 to 100 cm. Darker soil means more organic carbon. Tap a layer for its values.
                </li>
                <li>
                  <strong>Roots</strong> — illustrations of root <em>type</em>: grasses such as rice, maize and sorghum have fibrous roots; legumes have a taproot, and pink dots show root nodules
                  where nitrogen-fixing bacteria can live. Root depth is not measured.
                </li>
                <li>
                  The scene does <strong>not</strong> predict how your soil will change. Results beside the scene come from the analysis provider and show their source.
                </li>
              </ul>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Controls */}
      <div className="no-print mb-5 grid gap-4 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Region
          <select className="h-12 rounded-xl border border-forest-900/20 bg-white px-3 font-normal" value={regionId} onChange={(e) => { setRegionId(e.target.value); setStrategyIdx(0); setLayer(null); }} data-testid="roots-region">
            {farm!.regionId === CUSTOM_REGION_ID ? (
              <option value={CUSTOM_REGION_ID}>
                My location ({farm!.latitude.toFixed(2)}, {farm!.longitude.toFixed(2)})
              </option>
            ) : null}
            {(regions.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.id === farm!.regionId ? ' — my farm' : ' — demo farm'}
              </option>
            ))}
          </select>
        </label>
        <div className="lg:col-span-2">
          <p className="mb-1 text-sm font-semibold">Climate</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Climate scenario">
            {presets.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={p.id === presetId}
                onClick={() => setPresetId(p.id)}
                className={cn('min-h-11 cursor-pointer rounded-full border-2 px-4 text-sm font-semibold', p.id === presetId ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-forest-900/15 bg-white hover:border-sage-400')}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {q.isLoading ? <LoadingBlock rows={6} /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}

      {q.data && strategy && step ? (
        <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
          <div className="space-y-4">
            <Tabs value={String(strategyIdx)} onValueChange={(v) => setStrategyIdx(Number(v))}>
              <TabsList aria-label="Rotation option">
                {strategies.map((s, i) => (
                  <TabsTrigger key={s.id} value={String(i)}>
                    {s.name.replace(/\s*\(current\)/, ' (now)')}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Card className="overflow-hidden">
              <RootsScene
                step={step}
                crop={crop}
                environment={env}
                rainfallChangePercent={scenario.rainfallChangePercent}
                temperatureChangeCelsius={scenario.temperatureChangeCelsius}
                selectedLayer={layer}
                onSelectLayer={setLayer}
                calm={calmMotion}
              />
              <div className="space-y-3 border-t border-forest-900/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="icon" className="size-10" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause seasons' : 'Play seasons'} disabled={calmMotion}>
                    {playing && !calmMotion ? <Pause /> : <Play />}
                  </Button>
                  {strategy.steps.map((st, i) => (
                    <button
                      key={i}
                      onClick={() => { setStepIdx(i); setPlaying(false); }}
                      aria-pressed={i === stepIdx}
                      className={cn('min-h-10 cursor-pointer rounded-full px-3 text-sm font-semibold', i === stepIdx ? 'bg-forest-900 text-cream-50' : 'bg-cream-200 text-forest-900 hover:bg-sage-200')}
                    >
                      {st.season.name}: {cropLabel(map, st.cropId).replace(/\s*\(.*\)/, '')}
                    </button>
                  ))}
                </div>
                <RotationTimeline steps={strategy.steps} highlightMonths={months} compact />
              </div>
            </Card>
          </div>

          {/* Information beside the scene: actual adapter output + real observations */}
          <aside className="space-y-4" aria-label="What the scene shows">
            <AnalysisModeNotice mode={q.data.mode} modelVersion={q.data.modelVersion} />
            <Card className="space-y-3 p-5">
              <p className="text-sm text-ink-muted">Now showing</p>
              <h2 className="text-xl">
                {step.cropId === 'fallow' ? 'Fallow (resting)' : cropLabel(map, step.cropId)} · {step.season.name}
              </h2>
              <p className="text-sm">
                {MONTHS_SHORT[step.season.startMonth - 1]}–{MONTHS_SHORT[step.season.endMonth - 1]}
                {crop?.characteristics.durationDays ? ` · typical duration ${crop.characteristics.durationDays.min}–${crop.characteristics.durationDays.max} days` : ''}
              </p>
              <div className="flex items-start gap-2 text-sm">
                <CloudRain className="mt-0.5 size-4 shrink-0 text-series-1" aria-hidden />
                <span>
                  {avgRain != null ? (
                    <>
                      About <strong>{formatNumber(avgRain * (1 + scenario.rainfallChangePercent / 100))} mm</strong> of rain per month in these months
                      {scenario.rainfallChangePercent ? ` (hypothetical: observed ${formatNumber(avgRain)} mm ${scenario.rainfallChangePercent > 0 ? '+' : ''}${scenario.rainfallChangePercent}%)` : ' (NASA POWER average)'}.
                    </>
                  ) : (
                    'Rainfall data not available.'
                  )}
                </span>
              </div>
              {scenario.temperatureChangeCelsius ? (
                <p className="flex items-start gap-2 text-sm">
                  <Thermometer className="mt-0.5 size-4 shrink-0 text-series-2" aria-hidden /> Hypothetically {scenario.temperatureChangeCelsius} °C warmer than the observed average.
                </p>
              ) : null}
              {crop ? (
                <p className="flex items-start gap-2 text-sm">
                  <Sprout className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {crop.characteristics.rootSystem === 'fibrous' ? 'Fibrous roots (typical of grasses).' : 'Taproot system.'}{' '}
                  {crop.characteristics.nitrogenFixing ? 'As a legume it can host nitrogen-fixing bacteria in root nodules.' : ''} Water need: {crop.characteristics.waterNeed}.
                </p>
              ) : null}
            </Card>

            <Card className="space-y-3 p-5" data-testid="roots-result">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg">{strategy.name}</h3>
                <FeasibilityPill status={strategy.feasibility.status} />
              </div>
              {change && preset.id !== 'baseline' ? <p className="rounded-xl bg-sky-100 p-3 text-sm text-[#1c4f7a]">{change.summary}</p> : null}
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {strategy.risks.slice(0, 3).map((r) => (
                  <li key={r.text}>{r.text}</li>
                ))}
              </ul>
              <Link to={`/rotations/${strategy.id}`} className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline">
                Full explanation
              </Link>
            </Card>

            <Card className="space-y-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg">Soil layer</h3>
                <ProvenanceBadge type={layers ? 'estimated' : 'unavailable'} />
              </div>
              {layers ? (
                <>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Soil layer">
                    {layers.map((l, i) => (
                      <button key={l.depthLabel} role="radio" aria-checked={layer === i} onClick={() => setLayer(layer === i ? null : i)} className={cn('min-h-9 cursor-pointer rounded-full px-3 text-xs font-semibold', layer === i ? 'bg-gold-500 text-forest-900' : 'bg-cream-200 hover:bg-sage-200')}>
                        {l.topCm}–{l.bottomCm} cm
                      </button>
                    ))}
                  </div>
                  {selLayer ? (
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div><dt className="text-ink-muted">pH</dt><dd className="font-semibold">{formatNumber(selLayer.values.phH2O, 'en', 1)} ({phWord(selLayer.values.phH2O)})</dd></div>
                      <div><dt className="text-ink-muted">Organic carbon</dt><dd className="font-semibold">{formatNumber(selLayer.values.organicCarbonGPerKg, 'en', 1)} g/kg</dd></div>
                      <div className="col-span-2"><dt className="text-ink-muted">Texture</dt><dd className="font-semibold">{textureWord(selLayer.values.clayPercent, selLayer.values.sandPercent)}</dd></div>
                      <div><dt className="text-ink-muted">Nitrogen</dt><dd className="font-semibold">{formatNumber(selLayer.values.nitrogenGPerKg, 'en', 2)} g/kg</dd></div>
                      <div><dt className="text-ink-muted">Bulk density</dt><dd className="font-semibold">{formatNumber(selLayer.values.bulkDensityGPerCm3, 'en', 2)} g/cm³</dd></div>
                    </dl>
                  ) : (
                    <p className="text-sm text-ink-muted">Tap a layer in the scene or above to see its estimated properties.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-muted">Soil estimates are not available for this region yet, so the soil in the scene is only an illustration.</p>
              )}
            </Card>
          </aside>
        </div>
      ) : null}
    </PageContainer>
  );
}
