import type { RotationStep } from '@fieldverse/contracts';
import { useCropMap } from '@/hooks/queries';
import { cropLabel } from '@/components/CropVisual';
import { monthRange, MONTHS_SHORT, cn } from '@/lib/utils';

const ROLE_STYLE: Record<RotationStep['role'], string> = {
  main: 'bg-emerald-600 text-white',
  short_season: 'bg-sage-400 text-forest-950',
  cover: 'bg-gold-500 text-forest-950',
  fallow: 'bg-[repeating-linear-gradient(45deg,#efe6d8,#efe6d8_4px,#e2d4bf_4px,#e2d4bf_8px)] text-soil-700',
};
export const ROLE_LABEL: Record<RotationStep['role'], string> = { main: 'Main crop', short_season: 'Short-season crop', cover: 'Cover crop', fallow: 'Fallow / rest' };

/** 12-month crop calendar for a strategy. Role is encoded by colour AND pattern AND text. */
export function RotationTimeline({ steps, compact = false, highlightMonths }: { steps: RotationStep[]; compact?: boolean; highlightMonths?: number[] }) {
  const { map } = useCropMap();
  const cells = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const idx = steps.findIndex((s) => monthRange(s.season.startMonth, s.season.endMonth).includes(m));
    return { m, idx };
  });
  return (
    <div>
      <div className="grid grid-cols-12 gap-[2px]" role="list" aria-label="Twelve-month crop calendar">
        {cells.map(({ m, idx }) => {
          const step = idx >= 0 ? steps[idx] : null;
          const isStart = step && step.season.startMonth === m;
          return (
            <div
              key={m}
              role="listitem"
              aria-label={`${MONTHS_SHORT[m - 1]}: ${step ? `${cropLabel(map, step.cropId)} (${ROLE_LABEL[step.role]})` : 'no crop listed'}`}
              className={cn(
                'relative flex h-9 items-center overflow-visible rounded-[4px] text-[10px] font-bold',
                step ? ROLE_STYLE[step.role] : 'bg-cream-200',
                highlightMonths?.includes(m) && 'ring-2 ring-critical ring-offset-1',
              )}
            >
              {isStart && !compact ? <span className="pointer-events-none absolute left-1 z-10 whitespace-nowrap drop-shadow-sm">{cropLabel(map, step.cropId).replace(/\s*\(.*\)/, '')}</span> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-12 gap-[2px] text-center text-[10px] text-ink-muted" aria-hidden>
        {MONTHS_SHORT.map((m) => (
          <span key={m}>{m[0]}</span>
        ))}
      </div>
    </div>
  );
}

export function TimelineLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Calendar legend">
      {(Object.keys(ROLE_STYLE) as RotationStep['role'][]).map((r) => (
        <li key={r} className="flex items-center gap-1.5">
          <span className={cn('inline-block h-3 w-5 rounded-sm', ROLE_STYLE[r])} aria-hidden />
          {ROLE_LABEL[r]}
        </li>
      ))}
    </ul>
  );
}
