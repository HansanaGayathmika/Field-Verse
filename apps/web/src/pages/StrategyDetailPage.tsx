import { Link, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, CircleHelp, ClipboardCheck, Lightbulb, MessageCircleQuestion, ThumbsUp } from 'lucide-react';
import { FarmSubnav, PageContainer, PageHeader, RequireFarm } from '@/components/Page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AnalysisModeNotice, ErrorState, LoadingBlock } from '@/components/StatusStates';
import { FeasibilityPill, LevelDots, ProvenanceBadge } from '@/components/Provenance';
import { CropSequence } from '@/components/CropVisual';
import { SourceList } from '@/components/SourceList';
import { RotationTimeline, TimelineLegend } from '@/features/rotations/RotationTimeline';
import { useComparison } from '@/hooks/queries';
import { useFarm } from '@/contexts/FarmContext';
import { cn } from '@/lib/utils';

export default function StrategyDetailPage() {
  return (
    <RequireFarm>
      <Detail />
    </RequireFarm>
  );
}

function Section({ Icon, title, children, tone = 'default' }: { Icon: typeof Lightbulb; title: string; children: React.ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className={cn('mb-3 flex items-center gap-2 text-xl', tone === 'good' && 'text-good', tone === 'bad' && 'text-critical', tone === 'warn' && 'text-warning')}>
        <Icon className="size-6 shrink-0" aria-hidden /> {title}
      </h2>
      {children}
    </Card>
  );
}

function Detail() {
  const { strategyId } = useParams();
  const { farm } = useFarm();
  const q = useComparison(farm);
  const s = q.data?.strategies.find((x) => x.id === strategyId);

  if (q.isLoading) return <PageContainer><LoadingBlock /></PageContainer>;
  if (q.isError) return <PageContainer><ErrorState error={q.error} onRetry={() => q.refetch()} /></PageContainer>;
  if (!s || !q.data)
    return (
      <PageContainer>
        <p>This option is not part of the current comparison.</p>
        <Link to="/rotations" className="font-semibold text-emerald-700 underline">
          Back to Rotation Lab
        </Link>
      </PageContainer>
    );

  const sources = q.data.dataSources.filter((d) => s.sourceIds.includes(d.id));
  return (
    <PageContainer className="max-w-5xl">
      <FarmSubnav />
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/rotations">
          <ArrowLeft aria-hidden /> All options
        </Link>
      </Button>
      <PageHeader eyebrow={s.kind === 'current' ? 'Your current rotation' : 'Alternative rotation'} title={s.name} intro={s.summary} />
      <AnalysisModeNotice mode={q.data.mode} modelVersion={q.data.modelVersion} disclaimer={q.data.disclaimer} className="mb-6" />

      <div className="grid gap-5">
        <Section Icon={ClipboardCheck} title="What is the proposed rotation?">
          <CropSequence steps={s.steps} size={72} />
          <div className="mt-5">
            <RotationTimeline steps={s.steps} />
            <div className="mt-2">
              <TimelineLegend />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <FeasibilityPill status={s.feasibility.status} />
            <span className="text-sm text-ink-muted">Suitability: {s.suitability.level === 'unknown' ? 'not assessed' : s.suitability.level}</span>
            {s.suitability.score != null ? (
              <span className="text-sm">
                Score {s.suitability.score}/100 {s.suitability.scoreType === 'illustrative' ? '(illustrative)' : ''}
              </span>
            ) : null}
            <ProvenanceBadge type={s.suitability.sourceType} />
          </div>
          {s.feasibility.reasons.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {s.feasibility.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section Icon={Lightbulb} title="Why consider it?">
          <p className="text-lg">{s.explanation.summary}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {s.explanation.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          {s.priorityFit ? <p className="mt-3 rounded-xl bg-cream-100 p-3 text-sm">{s.priorityFit.explanation}</p> : null}
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section Icon={ThumbsUp} title="What benefits might it bring?" tone="good">
            <ul className="space-y-2">
              {s.benefits.map((b) => (
                <li key={b.text} className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex-1">{b.text}</span>
                  <ProvenanceBadge type={b.sourceType} />
                </li>
              ))}
            </ul>
          </Section>
          <Section Icon={AlertTriangle} title="What risks should you consider?" tone="bad">
            <ul className="space-y-2">
              {s.risks.map((r) => (
                <li key={r.text} className="flex flex-wrap items-start gap-2">
                  <span className={cn('rounded-full px-2 text-xs font-bold uppercase', r.severity === 'high' ? 'bg-[#fde3e1] text-critical' : r.severity === 'medium' ? 'bg-[#fdf0d5] text-warning' : 'bg-cream-200 text-ink-muted')}>
                    {r.severity} risk
                  </span>
                  <span className="flex-1">{r.text}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Section Icon={CircleHelp} title="What information is missing?" tone="warn">
            <ul className="space-y-2">
              {s.dataGaps.map((g) => (
                <li key={g.id} className="flex items-start gap-2">
                  <span className="mt-1 shrink-0 text-xs font-bold uppercase text-ink-muted">{g.impact} impact</span>
                  <span>{g.text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-forest-900/5 pt-3">
              <LevelDots level={s.uncertainty.level} label="Uncertainty" />
            </div>
            <p className="mt-2 text-sm text-ink-muted">{s.uncertainty.notes}</p>
            {s.uncertainty.interval ? (
              <p className="mt-1 text-sm">
                Range: {s.uncertainty.interval.lower}–{s.uncertainty.interval.upper}
                {s.uncertainty.interval.level ? ` (${Math.round(s.uncertainty.interval.level * 100)}% interval)` : ''}
              </p>
            ) : null}
          </Section>
          <Section Icon={MessageCircleQuestion} title="What should you check locally?">
            <ul className="list-disc space-y-1 pl-5">
              {s.localChecks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <h3 className="mt-4 font-sans text-sm font-bold uppercase tracking-wide text-ink-muted">Questions to ask an extension officer</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {s.dataGaps.map((g) => (
                <li key={g.id}>Can you help me find out: {g.text.charAt(0).toLowerCase() + g.text.slice(1)}</li>
              ))}
              <li>Is this rotation used successfully by other farmers near me?</li>
            </ul>
          </Section>
        </div>

        {s.explanation.technical ? (
          <Card className="bg-cream-50 p-5 text-sm">
            <p className="font-semibold">Technical note</p>
            <p className="text-ink-muted">{s.explanation.technical}</p>
          </Card>
        ) : null}

        <SourceList sources={sources} limitations={q.data.limitations} mode={q.data.mode} modelVersion={q.data.modelVersion} generatedAt={q.data.generatedAt} requestId={q.data.requestId} disclaimer={q.data.disclaimer} />
      </div>
    </PageContainer>
  );
}
