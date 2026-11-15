import type { Strategy } from '@fieldverse/contracts';
import { ProvenanceBadge } from '@/components/Provenance';
import { cn } from '@/lib/utils';

/** Fixed categorical order (validated reference slots 1–3). Colour follows the strategy, never its rank. */
export const STRATEGY_COLORS = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)'];
export const strategyColor = (index: number) => STRATEGY_COLORS[index % STRATEGY_COLORS.length];

/**
 * Simple comparison bars — one small group per indicator, one bar per strategy.
 * Every bar carries its strategy name and "n of 5" text, so colour is never the only cue.
 */
export function StrategyComparison({ strategies, className }: { strategies: Strategy[]; className?: string }) {
  const indicatorIds = [...new Set(strategies.flatMap((s) => s.indicators.map((i) => i.id)))];
  const ratingType = strategies[0]?.indicators[0]?.ratingType;
  const sourceType = strategies[0]?.indicators[0]?.sourceType ?? 'demo';
  return (
    <section className={cn('rounded-2xl border border-forest-900/10 bg-white p-5 sm:p-6', className)} aria-labelledby="cmp-title">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">How do the options compare?</p>
          <h3 id="cmp-title" className="text-lg font-semibold">
            Side-by-side ratings
          </h3>
        </div>
        <ProvenanceBadge type={sourceType} label={ratingType === 'illustrative' ? 'Illustrative demo ratings' : undefined} />
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        {ratingType === 'illustrative'
          ? 'Ratings from 1 to 5 were chosen by people to illustrate the comparison. They are not predictions.'
          : 'Ratings from 1 to 5 returned by the analysis service.'}{' '}
        Longer bars are always better for you.
      </p>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
        {strategies.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: strategyColor(i) }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="grid gap-5 md:grid-cols-2">
        {indicatorIds.map((id) => {
          const first = strategies.flatMap((s) => s.indicators).find((i) => i.id === id)!;
          const lowerBetter = first.direction === 'lower_is_better';
          return (
            <div key={id}>
              <p className="text-sm font-semibold text-forest-900">
                {first.label}
                <span className="ml-1 font-normal text-ink-muted">{lowerBetter ? '(less is better — bar shows how little)' : ''}</span>
              </p>
              <div className="mt-1.5 space-y-1.5">
                {strategies.map((s, i) => {
                  const ind = s.indicators.find((x) => x.id === id);
                  const r = ind?.rating ?? null;
                  const goodness = r == null ? 0 : lowerBetter ? 6 - r : r;
                  return (
                    <div key={s.id} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3.2rem] items-center gap-2 text-xs" title={ind?.explanation}>
                      <span className="truncate text-ink-muted">{s.name.replace(/\s*\(current\)/, ' (now)')}</span>
                      <span className="h-3 rounded-full bg-cream-200" aria-hidden>
                        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(goodness / 5) * 100}%`, background: strategyColor(i) }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums text-forest-900">{r == null ? 'n/a' : `${goodness} / 5`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
