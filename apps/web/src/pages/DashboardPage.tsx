import { Link, useLocation } from 'react-router';
import { ArrowRight, CalendarRange, CloudSun, Droplets, FlaskConical, Info, Leaf, Pencil, Scale, Sprout, Thermometer, Trees } from 'lucide-react';
import type { MeasuredValue } from '@fieldverse/contracts';
import { FarmSubnav, PageContainer, PageHeader, RequireFarm } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProvenanceBadge } from '@/components/Provenance';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { CropImage, cropLabel } from '@/components/CropVisual';
import { NdviTimelapse } from '@/components/NdviTimelapse';
import { AnnualRainfallChart, NdviChart, RainfallChart, TemperatureChart } from '@/features/charts/ClimateCharts';
import { SoilProfile, phWord } from '@/features/charts/SoilProfile';
import { useCropMap, useFarmObservations, useRegions } from '@/hooks/queries';
import { useFarm } from '@/contexts/FarmContext';
import { formatDate, cn } from '@/lib/utils';
import { CountUp } from '@/components/CountUp';
import { useTranslation } from 'react-i18next';
import { describeAnswers } from '@/lib/farmAnswers';

export default function DashboardPage() {
  return (
    <RequireFarm>
      <Dashboard />
    </RequireFarm>
  );
}

/** Boxes lift gently on hover (and stay still for reduced motion). */
const POP =
  'transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_18px_40px_-18px_rgb(15_42_34/0.35)] motion-reduce:transform-none';

function Dashboard() {
  const { farm } = useFarm();
  const location = useLocation();
  const notice = (location.state as { notice?: string | null } | null)?.notice;
  const regions = useRegions();
  const obs = useFarmObservations(farm);
  const { map } = useCropMap();
  const region = regions.data?.find((r) => r.id === farm!.regionId);
  const env = obs.data?.environment;
  const sources = obs.data?.dataSources ?? [];
  const crop = map.get(farm!.currentCrop);

  return (
    <PageContainer className="max-w-[1760px] lg:px-[6vw]">
      <FarmSubnav />
      <PageHeader
        eyebrow={region ? region.name : `Your location · ${farm!.latitude.toFixed(2)}, ${farm!.longitude.toFixed(2)}`}
        title={farm!.farmName}
        titleClassName="text-4xl sm:text-5xl lg:text-6xl"
        intro="What the satellites and global datasets say about your area — and what each number means for your farm."
        actions={
          <Button asChild variant="secondary">
            <Link to={`/setup?region=${farm!.regionId}`}>
              <Pencil aria-hidden /> Edit farm
            </Link>
          </Button>
        }
      />
      {notice ? (
        <p className="mb-6 flex gap-2 rounded-2xl bg-gold-100 p-4 text-sm">
          <Info className="size-5 shrink-0" aria-hidden /> {notice}
        </p>
      ) : null}

      {/* Farm summary */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.45fr] lg:gap-8">
        <Card className={cn('flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8', POP)}>
          <CropImage crop={crop} cropId={farm!.currentCrop} size={150} className="mx-auto sm:mx-0" />
          <div className="flex-1 space-y-2">
            <p className="text-base text-ink-muted">Current crop</p>
            <p className="font-display text-3xl text-forest-900">{cropLabel(map, farm!.currentCrop)}</p>
            {crop?.scientificName ? (
              <p className="text-base italic text-ink-muted">
                {crop.scientificName}
                {crop.family ? ` · ${crop.family}` : ''}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <ProvenanceBadge type="farmer_provided" />
              {farm!.isDemo ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-semibold text-[#6d4f12]">
                  <FlaskConical className="size-3.5" aria-hidden /> Demo farm
                </span>
              ) : null}
            </div>
            <p className="text-base">
              Irrigation: <strong>{farm!.irrigation === 'unknown' ? 'not known' : farm!.irrigation}</strong> · Soil:{' '}
              <strong>{farm!.soilType === 'unknown' ? 'not known' : farm!.soilType}</strong>
              {farm!.soilPh != null ? (
                <>
                  {' '}
                  · Your soil test pH: <strong>{farm!.soilPh}</strong>
                </>
              ) : null}
            </p>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:gap-5">
          <Metric Icon={Droplets} label="Rain per year" m={env?.highlights?.annualRainfallMm} digits={0} loading={obs.isLoading} hint="Average 2001–2025" />
          <Metric
            Icon={Thermometer}
            label="Average temperature"
            m={env?.highlights?.meanTemperatureC}
            digits={1}
            loading={obs.isLoading}
            hint="Average 2001–2025"
          />
          <Metric Icon={Leaf} label="Greenness (NDVI)" m={env?.highlights?.meanNdvi} digits={2} loading={obs.isLoading} hint="0 = bare · 1 = very green" />
          <Metric
            Icon={Sprout}
            label="Topsoil pH"
            m={env?.highlights?.topsoilPh}
            digits={1}
            loading={obs.isLoading}
            hint={env?.highlights?.topsoilPh?.value != null ? phWord(env.highlights.topsoilPh.value) : 'Top 5 cm'}
          />
          <Metric
            Icon={Trees}
            label="Topsoil organic carbon"
            m={env?.highlights?.topsoilOrganicCarbonGPerKg}
            digits={0}
            loading={obs.isLoading}
            hint="g per kg, top 5 cm"
          />
          <Card className={cn('flex flex-col justify-center gap-1.5 p-5 text-base', POP)}>
            <span className="text-ink-muted">Data prepared</span>
            <span className="font-semibold">{formatDate(obs.data?.preparedAt)}</span>
            <Link to="/data" className="font-semibold text-emerald-700 underline-offset-2 hover:underline">
              Sources
            </Link>
          </Card>
        </div>
      </div>

      <FarmAnswers />

      {/* Quick actions */}
      <section aria-label="Next steps" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {[
          { to: '/rotations', Icon: Scale, title: 'Compare rotations', body: 'Your current rotation vs. two alternatives' },
          { to: '/climate', Icon: CloudSun, title: 'Climate Time Machine', body: 'What if it were drier or hotter?' },
          { to: '/gaps', Icon: CalendarRange, title: 'Find idle months', body: 'Short crops or cover crops for gaps' },
          { to: '/roots', Icon: Sprout, title: 'Roots of Tomorrow', body: 'See your soil and crops come alive' },
        ].map((a) => (
          <Link key={a.to} to={a.to} className={cn('group flex items-center gap-3 rounded-2xl bg-forest-900 p-5 text-cream-50 hover:bg-forest-800', POP)}>
            <a.Icon className="size-8 shrink-0 text-gold-500" aria-hidden />
            <span className="flex-1">
              <span className="block font-semibold">{a.title}</span>
              <span className="text-sm text-cream-50/75">{a.body}</span>
            </span>
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        ))}
      </section>

      {obs.isLoading ? <LoadingBlock className="mt-6" label="Loading NASA observations…" /> : null}
      {obs.isError ? <ErrorState className="mt-6" error={obs.error} onRetry={() => obs.refetch()} /> : null}

      {env ? (
        <>
          {region ? (
            <section className="mt-10" aria-labelledby="seasons-title">
              <h2 id="seasons-title" className="text-2xl">
                Seasons in {region.shortName}
              </h2>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {region.seasons.map((s) => (
                  <div key={s.name} className={cn('rounded-2xl border border-forest-900/10 bg-white p-5', POP)}>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-sm text-ink-muted">{s.description}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Season names: general regional background (
                {region.contentSource.sourceType === 'estimated' ? 'compiled by the team — verify locally' : region.contentSource.note}).
              </p>
            </section>
          ) : null}

          <section className="mt-10" aria-labelledby="climate-title">
            <h2 id="climate-title" className="text-2xl">
              Climate
            </h2>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              {env.climate ? (
                <RainfallChart
                  monthly={env.climate.monthly}
                  sources={sources}
                  sourceId={env.climate.sourceId}
                  period={env.climate.period.replace(/.*\((.*)\).*/, '$1')}
                />
              ) : (
                <Unavailable title="Monthly rainfall" />
              )}
              {env.climate ? (
                <TemperatureChart
                  monthly={env.climate.monthly}
                  sources={sources}
                  sourceId={env.climate.sourceId}
                  period={env.climate.period.replace(/.*\((.*)\).*/, '$1')}
                />
              ) : (
                <Unavailable title="Temperature" />
              )}
              {env.annual ? (
                <AnnualRainfallChart years={env.annual.years} sources={sources} sourceId={env.annual.sourceId} />
              ) : (
                <Unavailable title="Yearly rainfall" />
              )}
              {env.vegetation ? (
                <NdviChart ndvi={env.vegetation.ndvi} sources={sources} sourceId={env.vegetation.sourceId} />
              ) : (
                <Unavailable title="Vegetation greenness (NDVI)" reason="Satellite vegetation values could not be prepared for this point." />
              )}
            </div>
          </section>

          <section className="mt-10 grid gap-5 lg:grid-cols-[1.3fr_1fr]" aria-labelledby="land-title">
            <div>
              <h2 id="land-title" className="mb-4 text-2xl">
                Soil
              </h2>
              <SoilProfile soil={env.soil} sources={sources} />
            </div>
            {env.media?.ndviTimelapse ? (
              <div>
                <h2 className="mb-4 text-2xl">The year from space</h2>
                <NdviTimelapse
                  webm={env.media.ndviTimelapse.webm}
                  mp4={env.media.ndviTimelapse.mp4}
                  poster={env.media.ndviTimelapse.poster}
                  fps={env.media.ndviTimelapse.framesPerSecond}
                  year={env.media.ndviTimelapse.year}
                  title={region?.shortName ?? 'Region'}
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </PageContainer>
  );
}

function Metric({
  Icon,
  label,
  m,
  digits,
  loading,
  hint,
}: {
  Icon: typeof Droplets;
  label: string;
  m?: MeasuredValue | null;
  digits: number;
  loading: boolean;
  hint: string;
}) {
  const unavailable = !loading && (m == null || m.value == null);
  return (
    <Card className={cn('flex flex-col gap-1.5 p-5', unavailable && 'bg-cream-50', POP)}>
      <span className="flex items-center gap-1.5 text-base text-ink-muted">
        <Icon className="size-5" aria-hidden /> {label}
      </span>
      <span className="text-3xl font-bold tabular-nums text-forest-900">
        {loading ? (
          '…'
        ) : unavailable ? (
          'Not available'
        ) : (
          <CountUp value={m!.value!} digits={digits} suffix={m!.unit.startsWith('mm') ? ' mm' : m!.unit === '°C' ? ' °C' : ''} />
        )}
      </span>
      <span className="text-sm text-ink-muted">{hint}</span>
      {!loading ? <ProvenanceBadge type={unavailable ? 'unavailable' : m!.sourceType} className="mt-1 self-start" /> : null}
    </Card>
  );
}

function Unavailable({ title, reason }: { title: string; reason?: string }) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <ProvenanceBadge type="unavailable" />
      </div>
      <p className="mt-2 text-ink-muted">
        {reason ?? 'This information is not available for this region yet.'} FieldVerse shows a gap rather than inventing numbers.
      </p>
    </Card>
  );
}

/** The farmer's answers from the input form, with "I do not know" answers marked as estimated. */
function FarmAnswers() {
  const { farm } = useFarm();
  const { t } = useTranslation();
  const { map } = useCropMap();
  const answers = describeAnswers(farm!, t, map).filter((a) => a.key !== 'current_crop');
  return (
    <Card className={cn('mt-8 p-6 sm:p-8', POP)} data-testid="farm-answers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl">Your answers</h2>
        <Link to={`/setup?region=${farm!.regionId}`} className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline">
          Edit answers
        </Link>
      </div>
      <dl className="mt-4 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {answers.map((a) => (
          <div key={a.key}>
            <dt className="text-sm text-ink-muted">{a.label}</dt>
            <dd className="text-lg font-semibold text-forest-900">
              {a.value}
              {a.unknown ? <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-[#6d4f12]">estimated later</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
