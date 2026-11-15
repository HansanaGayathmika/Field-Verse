import { Link } from 'react-router';
import { motion } from 'motion/react';
import { AlertTriangle, ArrowRight, Droplets, Flag, Layers, ThumbsUp, Trophy } from 'lucide-react';
import type { Strategy } from '@fieldverse/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FeasibilityPill, LevelDots, ProvenanceBadge } from '@/components/Provenance';
import { CropSequence } from '@/components/CropVisual';
import { RotationTimeline } from './RotationTimeline';
import { strategyColor } from '@/features/charts/StrategyComparison';

const SEVERITY = { high: 'text-critical', medium: 'text-warning', low: 'text-ink-muted' } as const;
const WATER_TEXT = {
  lower: 'Less water than now',
  similar: 'About the same water as now',
  higher: 'More water than now',
  unknown: 'Water use unknown',
} as const;

export function StrategyCard({
  strategy,
  index,
  changeNote,
  optionIndex,
}: {
  strategy: Strategy;
  index: number;
  changeNote?: string;
  /** 0-based position among the alternatives (A, B, C…). Defaults to index − 1 (current practice shown first). */
  optionIndex?: number;
}) {
  const s = strategy;
  const letter = String.fromCharCode(65 + Math.max(0, optionIndex ?? index - 1));
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex flex-col overflow-hidden rounded-3xl border border-forest-900/10 bg-white shadow-[var(--shadow-card)]"
      aria-labelledby={`st-${s.id}`}
      data-testid={`strategy-${s.id}`}
    >
      <div className="h-1.5" style={{ background: strategyColor(index) }} aria-hidden />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={s.kind === 'current' ? 'dark' : 'outline'}>{s.kind === 'current' ? 'What you do now' : `Option ${letter}`}</Badge>
          {s.priorityFit ? (
            <Badge variant={s.priorityFit.rank === 1 ? 'gold' : 'neutral'} title={s.priorityFit.explanation}>
              <Trophy aria-hidden /> #{s.priorityFit.rank} for your priorities
            </Badge>
          ) : null}
        </div>
        <div>
          <h3 id={`st-${s.id}`} className="text-xl">
            {s.name}
          </h3>
          <p className="mt-1 text-ink-muted">{s.summary}</p>
        </div>
        <CropSequence steps={s.steps} />
        <RotationTimeline steps={s.steps} />
        <div className="flex flex-wrap items-center gap-2">
          <FeasibilityPill status={s.feasibility.status} />
          <ProvenanceBadge type={s.suitability.sourceType} />
        </div>
        {changeNote ? <p className="rounded-xl bg-sky-100 p-3 text-sm text-[#1c4f7a]">{changeNote}</p> : null}
        {s.feasibility.reasons[0] ? <p className="text-sm">{s.feasibility.reasons[0]}</p> : null}

        <div className="grid gap-3 text-sm">
          <p className="flex gap-2">
            <Droplets className="mt-0.5 size-4 shrink-0 text-series-1" aria-hidden />
            <span>
              <strong>{WATER_TEXT[s.water.relativeDemand]}.</strong> {s.water.notes[0]}
            </span>
          </p>
          <p className="flex gap-2">
            <Layers className="mt-0.5 size-4 shrink-0 text-soil-500" aria-hidden />
            <span>
              <strong>Soil covered {s.soilCover.monthsCovered ?? '?'} of 12 months.</strong> {s.soilCover.notes[0]}
            </span>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <h4 className="mb-1 flex items-center gap-1.5 font-sans text-sm font-bold text-good">
              <ThumbsUp className="size-4" aria-hidden /> Possible benefits
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {s.benefits.slice(0, 3).map((b) => (
                <li key={b.text}>{b.text}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 flex items-center gap-1.5 font-sans text-sm font-bold text-critical">
              <AlertTriangle className="size-4" aria-hidden /> Risks to consider
            </h4>
            <ul className="space-y-1 text-sm">
              {s.risks.slice(0, 3).map((r) => (
                <li key={r.text} className="flex gap-1.5">
                  <span className={`shrink-0 text-xs font-bold uppercase ${SEVERITY[r.severity]}`}>{r.severity}</span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {s.constraintFlags.length ? (
          <ul className="space-y-1 rounded-xl bg-[#fdf0d5] p-3 text-sm text-[#5c4510]" aria-label="Your corrections">
            {s.constraintFlags.map((f, i) => (
              <li key={i} className="flex gap-1.5">
                <Flag className="mt-0.5 size-4 shrink-0" aria-hidden /> {f.message}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-forest-900/5 pt-4">
          <LevelDots level={s.uncertainty.level} label="Uncertainty" />
          <Button asChild variant="secondary" size="sm">
            <Link to={`/rotations/${s.id}`} data-testid={`details-${s.id}`}>
              Why? Full explanation <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
