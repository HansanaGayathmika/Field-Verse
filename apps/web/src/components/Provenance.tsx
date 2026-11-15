import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, CircleHelp, CircleSlash, FlaskConical, Info, Satellite, Sparkles, User, XCircle } from 'lucide-react';
import type { FeasibilityStatus, SourceType } from '@fieldverse/contracts';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const SOURCE_STYLE: Record<SourceType, { variant: 'sky' | 'soil' | 'green' | 'dark' | 'gold' | 'neutral'; Icon: typeof Satellite; hint: string }> = {
  observed: { variant: 'sky', Icon: Satellite, hint: 'Measured by satellites or weather records.' },
  estimated: { variant: 'soil', Icon: Info, hint: 'An estimate, not a measurement on your field.' },
  farmer_provided: { variant: 'green', Icon: User, hint: 'Information you gave us.' },
  modelled: { variant: 'dark', Icon: Sparkles, hint: 'Calculated by the analysis model.' },
  demo: { variant: 'gold', Icon: FlaskConical, hint: 'Prepared example to show how the tool works — not a prediction.' },
  unavailable: { variant: 'neutral', Icon: CircleSlash, hint: 'No data available.' },
};

/** Every value in FieldVerse carries one of these: colour + icon + text (never colour alone). */
export function ProvenanceBadge({ type, className, label }: { type: SourceType; className?: string; label?: string }) {
  const { t } = useTranslation();
  const s = SOURCE_STYLE[type];
  return (
    <Badge variant={s.variant} className={className} title={s.hint}>
      <s.Icon aria-hidden />
      {label ?? t(`provenance.${type}`)}
    </Badge>
  );
}

const FEAS: Record<FeasibilityStatus, { Icon: typeof CheckCircle2; cls: string }> = {
  feasible: { Icon: CheckCircle2, cls: 'bg-[#e3f3ea] text-good' },
  needs_review: { Icon: AlertTriangle, cls: 'bg-[#fdf0d5] text-warning' },
  not_feasible: { Icon: XCircle, cls: 'bg-[#fde3e1] text-critical' },
  unknown: { Icon: CircleHelp, cls: 'bg-cream-200 text-ink-muted' },
};

export function FeasibilityPill({ status, className }: { status: FeasibilityStatus; className?: string }) {
  const { t } = useTranslation();
  const f = FEAS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold', f.cls, className)}>
      <f.Icon className="size-4" aria-hidden />
      {t(`feasibility.${status}`)}
    </span>
  );
}

export function LevelDots({ level, label }: { level: 'low' | 'medium' | 'high' | 'unknown'; label: string }) {
  const n = level === 'low' ? 1 : level === 'medium' ? 2 : level === 'high' ? 3 : 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" aria-label={`${label}: ${level}`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('size-2 rounded-full', i <= n ? 'bg-forest-800' : 'bg-forest-900/15')} />
        ))}
      </span>
      <span className="capitalize text-ink-muted">{level}</span>
    </span>
  );
}
