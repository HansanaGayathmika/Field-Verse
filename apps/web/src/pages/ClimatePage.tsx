import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleHelp, CloudRain, Droplets, FlaskConical, Minus, RotateCcw, Sparkles, Sun, Thermometer, Wand2 } from 'lucide-react';
import type { ScenarioAssumptions, StrategyChange } from '@fieldverse/contracts';
import { FarmSubnav, PageContainer, PageHeader, RequireFarm } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/primitives';
import { AnalysisModeNotice, ErrorState, LoadingBlock } from '@/components/StatusStates';
import { FeasibilityPill } from '@/components/Provenance';
import { SourceList } from '@/components/SourceList';
import { CropSequence } from '@/components/CropVisual';
import { ScenarioRainChart } from '@/features/charts/ClimateCharts';
import { useAnalysisStatus, useFarmObservations, useScenario } from '@/hooks/queries';
import { useFarm } from '@/contexts/FarmContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatNumber, cn } from '@/lib/utils';
import type { Irrigation } from '@fieldverse/contracts';

export default function ClimatePage() {
  return (
    <RequireFarm>
      <ClimateTimeMachine />
    </RequireFarm>
  );
}

/** Each direction has its own colour band, so better / worse is clear at a glance. */
const DIR = {
  improves: { Icon: ArrowUpRight, label: 'Better', band: 'from-[#1f9d5c] to-[#14794a]', num: 'text-[#14794a]' },
  worsens: { Icon: ArrowDownRight, label: 'Worse', band: 'from-[#e5533d] to-[#b8321f]', num: 'text-[#b8321f]' },
  unchanged: { Icon: Minus, label: 'Little change', band: 'from-[#5f7d8c] to-[#47626f]', num: 'text-[#47626f]' },
  unknown: { Icon: CircleHelp, label: 'Unclear', band: 'from-[#d99a22] to-[#b07812]', num: 'text-[#8a5d0c]' },
} as const;

/** "Score 79 → 74 (-5 points). pigeonpea rain fit …" → the two scores and the rest of the sentence. */
function splitScore(summary: string | undefined) {
  const m = summary ? /^Score (\d+) → (\d+) \(([+\-−]?\d+) points?\)\.\s*/.exec(summary) : null;
  return m ? { before: Number(m[1]), after: Number(m[2]), rest: summary!.slice(m[0].length) } : { before: null, after: null, rest: summary ?? '' };
}

function MiniSky({
  title,
  rain,
  temp,
  rainChange,
  tempChange,
  calm,
  highlight,
}: {
  title: string;
  rain: number | null;
  temp: number | null;
  rainChange: number;
  tempChange: number;
  calm: boolean;
  highlight?: boolean;
}) {
  const heat = Math.max(0, Math.min(1, tempChange / 3));
  const cool = Math.max(0, Math.min(1, -tempChange / 2));
  const drops = Math.max(0, Math.round(12 * (1 + rainChange / 100)));
  const skyTop = heat > 0 ? `rgb(${Math.round(120 + 120 * heat)},${Math.round(185 - 40 * heat)},${Math.round(235 - 130 * heat)})` : cool > 0 ? `rgb(${Math.round(120 - 30 * cool)},${Math.round(170 - 20 * cool)},${Math.round(235)})` : '#79b8e8';
  const gid = `sky-${title.replace(/\W/g, '')}`;
  return (
    <div className={cn('overflow-hidden rounded-3xl border-2 bg-white/90 shadow-[var(--shadow-card)]', highlight ? 'border-[#3f6fd8]/60' : 'border-transparent')}>
      <svg viewBox="0 0 300 150" className="block w-full" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <motion.stop offset="0" animate={{ stopColor: skyTop }} transition={{ duration: 0.6 }} />
            <stop offset="1" stopColor="#e9f5ff" />
          </linearGradient>
        </defs>
        <rect width="300" height="110" fill={`url(#${gid})`} />
        <circle cx="250" cy="32" r={18 + heat * 9} fill="#ffcf4d" opacity="0.35" style={{ transition: 'r 0.6s ease' }} />
        <circle cx="250" cy="32" r={13 + heat * 7} fill="#ffc23a" style={{ transition: 'r 0.6s ease' }} />
        <g opacity={0.55 + Math.min(0.45, (1 + rainChange / 100) * 0.3)}>
          <ellipse cx="90" cy="32" rx="42" ry="13" fill="#fff" />
          <ellipse cx="112" cy="23" rx="25" ry="13" fill="#fff" />
          <ellipse cx="70" cy="26" rx="18" ry="10" fill="#fff" />
        </g>
        {Array.from({ length: drops }).map((_, i) => (
          <line
            key={i}
            x1={60 + ((i * 97) % 120)}
            y1={46}
            x2={57 + ((i * 97) % 120)}
            y2={56}
            stroke="#2a78d6"
            strokeWidth="2.2"
            strokeLinecap="round"
            style={calm ? undefined : { animation: `fv-rain ${0.9 + (i % 4) * 0.2}s linear infinite`, animationDelay: `${(i % 5) * 0.2}s` }}
          />
        ))}
        <path d="M0 108 Q60 88 130 104 T300 98 V150 H0Z" fill="#3fa36b" />
        <path d="M0 118 Q80 104 170 116 T300 112 V150 H0Z" fill="#1d8456" />
        <rect y="132" width="300" height="18" fill="#8a6142" />
      </svg>
      <div className="p-4">
        <p className="text-base font-bold text-forest-900">{title}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3f0fb] px-3 py-1 text-base font-bold text-[#164f8f]">
            <CloudRain className="size-5" aria-hidden /> {rain != null ? `${formatNumber(rain)} mm / year` : '—'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdebdf] px-3 py-1 text-base font-bold text-[#8a3413]">
            <Thermometer className="size-5" aria-hidden /> {temp != null ? `${formatNumber(temp, 'en', 1)} °C average` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionPill({ icon: Icon, children, id }: { icon: typeof Sparkles; children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#3550b8] via-[#156e9e] to-[#11806f] py-2 pl-2 pr-5 text-xl text-white shadow-md">
      <span className="grid size-8 place-items-center rounded-full bg-white/20">
        <Icon className="size-5" aria-hidden />
      </span>
      {children}
    </h2>
  );
}

function ClimateTimeMachine() {
  const { farm } = useFarm();
  const { calmMotion } = usePreferences();
  const status = useAnalysisStatus();
  const obs = useFarmObservations(farm);
  const [rain, setRain] = useState(0);
  const [temp, setTemp] = useState(0);
  const [irrigation, setIrrigation] = useState<Irrigation>(farm!.irrigation);

  const presets = useMemo(() => status.data?.scenarioPresets ?? [], [status.data]);
  const continuous = status.data?.capabilities && (status.data.capabilities as { scenarioInput?: string }).scenarioInput === 'continuous';
  const scenario: ScenarioAssumptions = { rainfallChangePercent: rain, temperatureChangeCelsius: temp };
  /** The real engine takes the farmer's own prediction (any value in the contract range); the demo only has presets. */
  const range = continuous ? { rMin: -50, rMax: 50, rStep: 5, tMin: -2, tMax: 5 } : { rMin: -30, rMax: 30, rStep: 10, tMin: 0, tMax: 3 };
  const deferred = useDeferredValue(scenario);
  const matched = presets.find(
    (p) => p.rainfallChangePercent === deferred.rainfallChangePercent && p.temperatureChangeCelsius === deferred.temperatureChangeCelsius,
  );
  const supported = !!continuous || !!matched;
  const profile = useMemo(() => ({ ...farm!, irrigation }), [farm, irrigation]);
  const q = useScenario(profile, deferred, supported && status.isSuccess);

  const env = obs.data?.environment;
  // Live NASA observations first; if that lookup has nothing for this place, the engine's own climate for the same field.
  const baseRain = env?.highlights?.annualRainfallMm?.value ?? q.data?.climateContext.baselineAnnualRainfallMm ?? null;
  const baseTemp = env?.highlights?.meanTemperatureC?.value ?? q.data?.climateContext.baselineMeanTemperatureC ?? null;
  const hypoRain = baseRain == null ? null : baseRain * (1 + rain / 100);
  const hypoTemp = baseTemp == null ? null : baseTemp + temp;

  const nearest = useMemo(
    () =>
      [...presets]
        .sort(
          (a, b) =>
            Math.abs(a.rainfallChangePercent - rain) / 10 +
            Math.abs(a.temperatureChangeCelsius - temp) -
            (Math.abs(b.rainfallChangePercent - rain) / 10 + Math.abs(b.temperatureChangeCelsius - temp)),
        )
        .slice(0, 3),
    [presets, rain, temp],
  );
  const reset = () => {
    setRain(0);
    setTemp(0);
    setIrrigation(farm!.irrigation);
  };

  return (
    <PageContainer>
      <FarmSubnav />
      <PageHeader
        eyebrow="Climate Time Machine"
        title="What if the weather changed?"
        intro="Enter how you expect rain and temperature to change at your farm, and see how the rotation options might be affected. These are “what if” questions — not forecasts."
        actions={
          <Button variant="secondary" onClick={reset}>
            <RotateCcw aria-hidden /> Reset
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        {/* Controls */}
        <div className="self-start overflow-hidden rounded-3xl bg-white/90 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#2a78d6] via-[#5b6fd6] to-[#eb6834] px-5 py-4 text-white sm:px-6">
            <h2 className="flex items-center gap-2 text-xl text-white">
              <Wand2 className="size-5" aria-hidden /> Your assumptions
            </h2>
            {status.data?.provider === 'demo' ? (
              <Badge variant="gold">
                <FlaskConical aria-hidden /> Illustrative Demo
              </Badge>
            ) : null}
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="rounded-2xl bg-gradient-to-br from-[#eaf4fd] to-[#d8eafa] p-4">
              <div className="mb-1 flex items-center justify-between">
                <label className="flex items-center gap-2 text-base font-bold text-[#164f8f]" id="rain-label">
                  <span className="grid size-8 place-items-center rounded-xl bg-[#2a78d6] text-white">
                    <CloudRain className="size-5" aria-hidden />
                  </span>
                  Rainfall change
                </label>
                <output className="rounded-full bg-[#2a78d6] px-3.5 py-1 text-lg font-black tabular-nums text-white shadow-sm" aria-live="polite">
                  {rain > 0 ? '+' : ''}
                  {rain}%
                </output>
              </div>
              <Slider
                min={range.rMin}
                max={range.rMax}
                step={range.rStep}
                value={[rain]}
                onValueChange={([v]) => setRain(v)}
                thumbLabel="Rainfall change in percent"
                aria-labelledby="rain-label"
                data-testid="rain-slider"
              />
              <div className="flex justify-between text-sm font-medium text-[#1c4f7a]">
                <span>{-range.rMin}% less</span>
                <span>no change</span>
                <span>{range.rMax}% more</span>
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-[#fff1e6] to-[#fddcc6] p-4">
              <div className="mb-1 flex items-center justify-between">
                <label className="flex items-center gap-2 text-base font-bold text-[#8a3413]" id="temp-label">
                  <span className="grid size-8 place-items-center rounded-xl bg-[#eb6834] text-white">
                    <Sun className="size-5" aria-hidden />
                  </span>
                  Temperature change
                </label>
                <output className="rounded-full bg-[#eb6834] px-3.5 py-1 text-lg font-black tabular-nums text-white shadow-sm" aria-live="polite">
                  {temp > 0 ? '+' : ''}
                  {temp} °C
                </output>
              </div>
              <Slider
                min={range.tMin}
                max={range.tMax}
                step={0.5}
                value={[temp]}
                onValueChange={([v]) => setTemp(v)}
                thumbLabel="Temperature change in degrees Celsius"
                aria-labelledby="temp-label"
              />
              <div className="flex justify-between text-sm font-medium text-[#8a3413]">
                <span>{range.tMin < 0 ? `${range.tMin} °C` : 'no change'}</span>
                <span>+{range.tMax} °C</span>
              </div>
            </div>
            <label className="flex flex-col gap-1.5 rounded-2xl bg-gradient-to-br from-[#e6f7ec] to-[#d2efdd] p-4 text-base font-bold text-[#13623a]">
              <span className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-[#1f8a52] text-white">
                  <Droplets className="size-5" aria-hidden />
                </span>
                Irrigation in this scenario
              </span>
              <select
                className="h-12 rounded-xl border border-forest-900/20 bg-white px-3 font-normal text-forest-900"
                value={irrigation}
                onChange={(e) => setIrrigation(e.target.value as Irrigation)}
              >
                <option value="none">No irrigation — rain only</option>
                <option value="limited">Some irrigation, not always</option>
                <option value="full">Reliable irrigation</option>
                <option value="unknown">I don't know</option>
              </select>
            </label>
            {presets.length ? (
              <div>
                <p className="mb-2 text-sm font-bold text-forest-900">Quick choices</p>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setRain(p.rainfallChangePercent);
                        setTemp(p.temperatureChangeCelsius);
                      }}
                      data-testid={`preset-${p.id}`}
                      className={cn(
                        'min-h-10 cursor-pointer rounded-full border-2 px-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5',
                        p.rainfallChangePercent === rain && p.temperatureChangeCelsius === temp
                          ? 'border-transparent bg-gradient-to-r from-[#2a78d6] to-[#eb6834] text-white shadow-md'
                          : 'border-forest-900/15 bg-white hover:border-[#2a78d6]',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Before / after */}
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <MiniSky title="Today" rain={baseRain} temp={baseTemp} rainChange={0} tempChange={0} calm={calmMotion} />
            <MiniSky title="What if" rain={hypoRain} temp={hypoTemp} rainChange={rain} tempChange={temp} calm={calmMotion} highlight={rain !== 0 || temp !== 0} />
          </div>
          {env?.climate ? (
            <ScenarioRainChart
              monthly={env.climate.monthly}
              rainfallChangePercent={rain}
              sources={obs.data!.dataSources}
              sourceId={env.climate.sourceId}
              height={200}
            />
          ) : null}
        </div>
      </div>

      {/* Results */}
      <section className="mt-10 space-y-5" aria-labelledby="results-title" aria-live="polite">
        <SectionPill icon={Sparkles} id="results-title">
          How the options might be affected
        </SectionPill>
        {!supported && status.isSuccess ? (
          <div className="rounded-2xl border border-gold-500/50 bg-gold-100 p-5" role="status" data-testid="scenario-unsupported">
            <p className="font-semibold">This exact combination is not prepared in the demo.</p>
            <p className="mt-1 text-sm text-[#5c4510]">
              The pictures above still show your assumption, but we will not invent results for it. The real AI/ML service will analyse any combination. Try a
              prepared combination:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {nearest.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRain(p.rainfallChangePercent);
                    setTemp(p.temperatureChangeCelsius);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {supported && q.isLoading ? <LoadingBlock /> : null}
        {supported && q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
        {supported && q.data ? (
          <div className="space-y-6" data-testid="scenario-results">
            <AnalysisModeNotice mode={q.data.mode} modelVersion={q.data.modelVersion} disclaimer={q.data.disclaimer} />
            <div className="rounded-3xl border-2 border-[#b9c6f3] bg-gradient-to-br from-[#eef2ff] via-[#f3f0fe] to-[#e9f6fb] p-5 shadow-sm sm:p-6">
              <p className="inline-flex flex-wrap items-center gap-2 text-lg font-bold text-forest-900">
                Scenario:
                <span className="rounded-full bg-gradient-to-r from-[#2a78d6] to-[#eb6834] px-3 py-0.5 text-base text-white">{q.data.modified.label}</span>
              </p>
              <ul className="mt-3 space-y-2.5">
                {q.data.explanation.map((e) => (
                  <li key={e} className="flex gap-3 text-[0.98rem] leading-relaxed text-[#22304a]">
                    <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-[#5b6fd6] text-white">
                      <Sparkles className="size-3.5" aria-hidden />
                    </span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-muted">{q.data.climateContext.note}</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              {q.data.strategies.map((s, i) => {
                const c = q.data!.changes.find((x) => x.strategyId === s.id) as StrategyChange | undefined;
                const d = DIR[c?.direction ?? 'unknown'];
                const sc = splitScore(c?.summary);
                return (
                  <motion.div
                    key={s.id}
                    initial={calmMotion ? false : { opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.4 }}
                    className="flex flex-col overflow-hidden rounded-3xl bg-white/90 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-1"
                    data-testid={`change-${s.id}`}
                  >
                    <div className={cn('flex items-center justify-between gap-2 bg-gradient-to-r px-5 py-3 text-white', d.band)}>
                      <span className="inline-flex items-center gap-1.5 text-lg font-bold">
                        <d.Icon className="size-6" aria-hidden /> {d.label}
                      </span>
                      <span className="text-sm font-semibold text-white/90">Option {i + 1}</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <h3 className="text-lg leading-snug">{s.name}</h3>
                      <CropSequence steps={s.steps} size={48} compact />
                      {sc.before != null && sc.after != null ? (
                        <div className="flex items-center gap-3 rounded-2xl bg-cream-100 px-4 py-3">
                          <div className="text-center">
                            <p className="text-xs font-semibold text-ink-muted">Today</p>
                            <p className="text-2xl font-black tabular-nums text-forest-900">{sc.before}</p>
                          </div>
                          <ArrowRight className="size-5 text-ink-muted" aria-label="becomes" />
                          <div className="text-center">
                            <p className="text-xs font-semibold text-ink-muted">What if</p>
                            <p className={cn('text-2xl font-black tabular-nums', d.num)}>{sc.after}</p>
                          </div>
                          <p className={cn('ml-auto text-sm font-bold', d.num)}>
                            {sc.after - sc.before > 0 ? '+' : ''}
                            {sc.after - sc.before} points
                          </p>
                        </div>
                      ) : null}
                      {c ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <FeasibilityPill status={c.feasibilityBefore} className="px-2 py-0.5 text-xs" />
                          <ArrowRight className="size-4" aria-label="becomes" />
                          <FeasibilityPill status={c.feasibilityAfter} className="px-2 py-0.5 text-xs" />
                        </div>
                      ) : null}
                      {sc.rest ? <p className="text-[0.95rem] leading-relaxed text-[#23362e]">{sc.rest}</p> : null}
                      {s.risks[0] ? (
                        <p className="rounded-xl bg-[#fff5e6] px-3 py-2 text-sm text-[#6d4f12]">
                          <strong>Main risk:</strong> {s.risks[0].text}
                        </p>
                      ) : null}
                      <Link
                        to={`/rotations/${s.id}`}
                        className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Details <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <SourceList
              sources={q.data.dataSources}
              limitations={q.data.limitations}
              mode={q.data.mode}
              modelVersion={q.data.modelVersion}
              generatedAt={q.data.generatedAt}
              requestId={q.data.requestId}
              disclaimer={q.data.disclaimer}
            />
          </div>
        ) : null}
      </section>
    </PageContainer>
  );
}
