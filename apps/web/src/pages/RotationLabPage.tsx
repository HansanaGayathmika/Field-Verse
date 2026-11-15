import { Link, useLocation } from 'react-router';
import { CloudSun, Printer, Sprout } from 'lucide-react';
import { FarmSubnav, PageContainer, PageHeader, RequireFarm } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { AnalysisModeNotice, ErrorState, LoadingBlock } from '@/components/StatusStates';
import { SourceList } from '@/components/SourceList';
import { StrategyCard } from '@/features/rotations/StrategyCard';
import { TimelineLegend } from '@/features/rotations/RotationTimeline';
import { DisagreePanel } from '@/features/rotations/DisagreePanel';
import { StrategyComparison } from '@/features/charts/StrategyComparison';
import { useComparison, useRegions } from '@/hooks/queries';
import { useFarm } from '@/contexts/FarmContext';
import { CommunityLinks } from '@/features/community/CommunityLinks';

export default function RotationLabPage() {
  return (
    <RequireFarm>
      <RotationLab />
    </RequireFarm>
  );
}

function RotationLab() {
  const { farm } = useFarm();
  const notice = (useLocation().state as { notice?: string | null } | null)?.notice;
  const q = useComparison(farm);
  const regions = useRegions();
  const region = regions.data?.find((r) => r.id === farm!.regionId);
  const data = q.data;
  const cropIds = [
    ...new Set([...(region?.supportedCrops ?? []), ...(data?.strategies.flatMap((s) => s.steps.map((x) => x.cropId)).filter((c) => c !== 'fallow') ?? [])]),
  ];

  return (
    <PageContainer>
      <FarmSubnav />
      <PageHeader
        eyebrow="Rotation Lab"
        title="Compare three futures for your field"
        intro={
          <>
            Your current rotation next to two alternatives for <strong>{farm!.farmName}</strong>. Nothing is hidden: options are only <em>ordered</em> by your
            priorities.
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/climate">
                <CloudSun aria-hidden /> Try a climate “what if”
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/plan">
                <Printer aria-hidden /> Decision card
              </Link>
            </Button>
          </>
        }
      />

      {notice ? <p className="mb-6 rounded-2xl bg-gold-100 p-4 text-sm">{notice}</p> : null}
      {q.isLoading ? <LoadingBlock label="Asking the analysis provider…" rows={5} /> : null}
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()}>
          <p className="text-sm">
            You can still explore your{' '}
            <Link className="font-semibold text-emerald-700 underline" to="/farm">
              climate and soil information
            </Link>
            .
          </p>
        </ErrorState>
      ) : null}

      {data ? (
        <div className="space-y-8" aria-busy={q.isFetching}>
          <AnalysisModeNotice mode={data.mode} modelVersion={data.modelVersion} disclaimer={data.disclaimer} />
          {/* The engine moved the planting month because the farmer's month had too few workable crops. */}
          {data.limitations
            .filter((l) => /these plans start in/i.test(l))
            .map((l) => (
              <p key={l} role="note" className="rounded-2xl bg-gold-100 p-4 text-sm">
                {l}
              </p>
            ))}

          <section aria-labelledby="strategies-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 id="strategies-title" className="text-2xl">
                The options
              </h2>
              <TimelineLegend />
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              {data.strategies.map((s, i) => (
                <StrategyCard key={s.id} strategy={s} index={i} optionIndex={i - (data.strategies[0]?.kind === 'current' ? 1 : 0)} />
              ))}
            </div>
          </section>

          <StrategyComparison strategies={data.strategies} />

          <CommunityLinks
            cropIds={[...new Set(data.strategies.flatMap((s) => s.steps.map((x) => x.cropId)).filter((c) => c !== 'fallow'))]}
            fallbackCountry={region?.country ?? null}
          />

          <DisagreePanel cropIds={cropIds} results={data.constraintsApplied} isUpdating={q.isFetching} />

          <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-forest-900 p-6 text-cream-50">
            <Sprout className="size-8 text-gold-500" aria-hidden />
            <p className="flex-1">See these rotations grow above and below the ground.</p>
            <Button asChild variant="gold">
              <Link to="/roots">Open Roots of Tomorrow</Link>
            </Button>
          </div>

          <SourceList
            sources={data.dataSources}
            limitations={data.limitations}
            mode={data.mode}
            modelVersion={data.modelVersion}
            generatedAt={data.generatedAt}
            requestId={data.requestId}
            disclaimer={data.disclaimer}
          />
        </div>
      ) : null}
    </PageContainer>
  );
}
