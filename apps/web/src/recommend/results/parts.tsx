import { AlertTriangle, BookOpen, CheckCircle2, CircleHelp, ExternalLink, Info, Shield, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { cropIcon, cropName } from '../config/crops';
import { useRT } from '../i18n';
import { GOALS, type Benefit, type Goal, type Plan, type Priority, type Recommendation, type SeasonStep } from '../types';

/* ------------------------------ helpers ------------------------------ */
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const signed = (n: number) => (Number.isFinite(n) ? `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}` : '—');
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);

const RANK: Record<Priority, number> = { very_important: 3, important: 2, slightly_important: 1, not_important: 0 };
/** Goals in the farmer's priority order (most important first; ties keep the standard order). */
export function goalsByPriority(priorities?: Partial<Record<Goal, Priority>>): Goal[] {
  return [...GOALS].sort((a, b) => RANK[priorities?.[b] ?? 'important'] - RANK[priorities?.[a] ?? 'important']);
}

/** Evidence strength from the engine's free-text label (rule from the UI contract). */
export function evidenceStrength(level: string): 'strong' | 'moderate' | 'weak' {
  const l = level.toLowerCase();
  if (l.includes('meta-analysis')) return 'strong';
  if (l.includes('heuristic') || l.includes('uncited')) return 'weak';
  return 'moderate';
}

/* ------------------------------ confidence ------------------------------ */
export function ConfidenceBadge({ confidence }: { confidence: Recommendation['confidence'] }) {
  const { t } = useRT();
  const level = confidence.level;
  const Icon = level === 'High' ? ShieldCheck : level === 'Medium' ? Shield : ShieldAlert;
  const tone = level === 'High' ? 'bg-emerald-100 text-emerald-700' : level === 'Medium' ? 'bg-[#fdf0d5] text-warning' : 'bg-[#fde3e1] text-critical';
  const label = t(`results.confidence_${level}`, { defaultValue: level || '—' });
  return (
    <div className="rounded-2xl border border-forest-900/10 bg-white p-4" data-testid="confidence">
      <p className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold', tone)}>
        <Icon className="size-4" aria-hidden /> {t('results.confidence', { level: label })}
      </p>
      {confidence.reasons.length || confidence.note ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-emerald-700">{t('results.whyConfidence')}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
            {confidence.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {confidence.note ? <p className="mt-2 text-xs text-ink-muted">{confidence.note}</p> : null}
        </details>
      ) : null}
    </div>
  );
}

export function Callout({ tone, title, items, testId }: { tone: 'warning' | 'info'; title: string; items: string[]; testId?: string }) {
  if (!items.length) return null;
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <section
      className={cn('rounded-2xl border p-4 sm:p-5', tone === 'warning' ? 'border-warning/30 bg-[#fdf6e7]' : 'border-forest-900/10 bg-white')}
      data-testid={testId}
      aria-label={title}
    >
      <h2 className={cn('flex items-center gap-2 font-sans text-base font-bold', tone === 'warning' ? 'text-warning' : 'text-forest-900')}>
        <Icon className="size-5" aria-hidden /> {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-6 text-[0.95rem]">
        {items.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------ plan card parts ------------------------------ */
function SuitabilityBar({ score, range }: { score: number; range: [number, number] }) {
  const { t } = useRT();
  const [lo, hi] = range;
  const hasRange = Number.isFinite(lo) && Number.isFinite(hi);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-forest-900">{t('results.suitability')}</span>
        <span className="text-ink-muted">
          <span className="font-semibold text-forest-900">{t('results.suitabilityValue', { score: fmt(score) })}</span>
          {hasRange ? ` · ${t('results.suitabilityRange', { low: fmt(lo), high: fmt(hi) })}` : null}
        </span>
      </div>
      <div
        className="relative mt-1 h-2.5 rounded-full bg-forest-900/10"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number.isFinite(score) ? score : undefined}
        aria-label={t('results.suitability')}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-600" style={{ width: `${clamp(score)}%` }} />
        {hasRange ? (
          <div
            className="absolute -inset-y-1 rounded-sm border-x-2 border-forest-900/60"
            style={{ left: `${clamp(lo)}%`, width: `${Math.max(0.5, clamp(hi) - clamp(lo))}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

function RainFit({ fit }: { fit: SeasonStep['rain_fit'] }) {
  const { t } = useRT();
  const s = fit.status;
  const Icon = s === 'good' ? CheckCircle2 : s === 'marginal' ? AlertTriangle : s === 'poor' ? XCircle : CircleHelp;
  const tone = s === 'good' ? 'text-good' : s === 'marginal' ? 'text-warning' : s === 'poor' ? 'text-critical' : 'text-ink-muted';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', tone)}>
      <Icon className="size-3.5" aria-hidden /> {t('results.rainFit', { status: t(`results.rain_${s}`, { defaultValue: s }) })}
    </span>
  );
}

function SeasonTimeline({ sequence }: { sequence: SeasonStep[] }) {
  const { t } = useRT();
  return (
    <ol className="grid gap-3 md:grid-cols-3" data-testid="season-timeline">
      {sequence.map((s, i) => {
        const icon = cropIcon(s.crop);
        return (
          <li key={i} className="relative rounded-xl border border-forest-900/10 bg-cream-100 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
              {t('results.season', { n: Number.isFinite(s.season) ? s.season : i + 1 })} · {t('results.plant', { month: s.plant_month || '—' })}
            </p>
            <div className="mt-2 flex items-center gap-3">
              {icon ? <img src={icon} alt="" className="size-10 rounded-lg bg-white" /> : null}
              <div>
                <p className="font-display text-lg leading-tight text-forest-900">{s.crop_name || cropName(s.crop)}</p>
                {Number.isFinite(s.approx_duration_days) ? (
                  <p className="text-xs text-ink-muted">{t('results.duration', { days: fmt(s.approx_duration_days) })}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <SuitabilityBar score={s.suitability_score} range={s.suitability_range} />
              <RainFit fit={s.rain_fit} />
            </div>
            {s.notes.length ? (
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {s.notes.map((n, j) => (
                  <li key={j} className="flex gap-1.5">
                    <span aria-hidden>•</span>
                    {n}
                  </li>
                ))}
              </ul>
            ) : null}
            {i < sequence.length - 1 ? (
              <span className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-forest-900/30 md:block" aria-hidden>
                ›
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function GoalScores({ goals, order, priorities }: { goals: Plan['scores']['goals']; order: Goal[]; priorities?: Partial<Record<Goal, Priority>> }) {
  const { t } = useRT();
  return (
    <section aria-label={t('results.goalScores')}>
      <h4 className="font-sans text-sm font-bold text-forest-900">{t('results.goalScores')}</h4>
      <p className="text-xs text-ink-muted">{t('results.goalScoresHelp')}</p>
      <ul className="mt-3 space-y-2.5">
        {order.map((g) => {
          const v = goals[g];
          if (v === undefined) return null;
          return (
            <li key={g} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[14rem_minmax(0,1fr)_2.5rem]">
              <span className="text-sm">
                {t(`goals.${g}`)}
                {priorities?.[g] ? (
                  <span className="block text-xs text-ink-muted">{t('results.yourPriority', { level: t(`priorities.levels.${priorities[g]}`) })}</span>
                ) : null}
              </span>
              <span
                className="order-3 col-span-2 h-2 rounded-full bg-forest-900/10 sm:order-none sm:col-span-1"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={v}
                aria-label={t(`goals.${g}`)}
              >
                <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${clamp(v)}%` }} />
              </span>
              <span className="text-right text-sm font-semibold tabular-nums">{fmt(v)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EvidenceBadge({ level }: { level: string }) {
  const { t } = useRT();
  if (!level) return null;
  const s = evidenceStrength(level);
  const Icon = s === 'strong' ? ShieldCheck : s === 'weak' ? CircleHelp : BookOpen;
  const tone = s === 'strong' ? 'bg-emerald-100 text-emerald-700' : s === 'weak' ? 'bg-cream-200 text-ink-muted' : 'bg-sky-100 text-[#1c4f7a]';
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1 rounded-full px-2.5 py-0.5 text-xs', tone)} data-evidence={s}>
      <Icon className="size-3.5" aria-hidden />
      <span className="font-bold">{t(`results.evidence_${s}`)}</span>
      <span>· {level}</span>
    </span>
  );
}

function BenefitItem({ b }: { b: Benefit }) {
  const { t } = useRT();
  return (
    <li className="rounded-xl border border-forest-900/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-forest-900">{b.title}</p>
        <EvidenceBadge level={b.evidence_level} />
      </div>
      <p className="mt-1 text-[0.95rem]">{b.text}</p>
      {b.conditions.length ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold text-emerald-700">{t('results.conditions')}</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-muted">
            {b.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {b.sources.length ? (
        <div className="mt-2 text-xs">
          <p className="font-semibold text-ink-muted">{t('results.sources')}</p>
          <ul className="mt-1 space-y-1">
            {b.sources.map((s, i) => (
              <li key={s.id || i}>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-1 text-emerald-700 underline-offset-2 hover:underline"
                  >
                    {s.cite || s.url} <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  s.cite
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function VsCurrent({ vs, order }: { vs: NonNullable<Plan['vs_current_practice']>; order: Goal[] }) {
  const { t } = useRT();
  const tone = (n: number) => (n > 0 ? 'text-good' : n < 0 ? 'text-critical' : 'text-ink-muted');
  return (
    <section className="rounded-xl bg-sage-100 p-4" data-testid="vs-current">
      <h4 className="font-sans text-sm font-bold text-forest-900">{t('results.vsCurrent')}</h4>
      <p className={cn('mt-1 font-display text-xl', tone(vs.composite_change))}>{t('results.vsCurrentOverall', { change: signed(vs.composite_change) })}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {order.map((g) => {
          const v = vs.goal_changes[g];
          if (v === undefined) return null;
          return (
            <li key={g} className="rounded-full bg-white px-3 py-1 text-xs">
              {t(`goals.${g}`)}: <span className={cn('font-bold tabular-nums', tone(v))}>{signed(v)}</span>
            </li>
          );
        })}
      </ul>
      {vs.current_practice_sequence.length ? (
        <p className="mt-2 text-xs text-ink-muted">{t('results.vsCurrentSequence', { sequence: vs.current_practice_sequence.map(cropName).join(' → ') })}</p>
      ) : null}
      {vs.note ? <p className="mt-1 text-xs text-ink-muted">{vs.note}</p> : null}
    </section>
  );
}

export function PlanCard({ plan, priorities }: { plan: Plan; priorities?: Partial<Record<Goal, Priority>> }) {
  const { t } = useRT();
  const order = goalsByPriority(priorities);
  return (
    <article
      className="rounded-3xl border border-forest-900/10 bg-white p-5 shadow-[var(--shadow-card)] sm:p-7"
      data-testid="plan-card"
      aria-labelledby={`plan-${plan.option}`}
    >
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-gold-500 font-bold text-forest-900">{plan.option}</span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{t('results.option', { n: plan.option })}</p>
          <h3 id={`plan-${plan.option}`} className="text-2xl">
            {plan.label || t('results.option', { n: plan.option })}
          </h3>
        </div>
      </header>
      <div className="mt-5 space-y-6">
        <SeasonTimeline sequence={plan.sequence} />
        <GoalScores goals={plan.scores.goals} order={order} priorities={priorities} />
        {plan.benefits.length ? (
          <section>
            <h4 className="font-sans text-sm font-bold text-forest-900">{t('results.benefits')}</h4>
            <ul className="mt-2 space-y-3">
              {plan.benefits.map((b, i) => (
                <BenefitItem key={i} b={b} />
              ))}
            </ul>
          </section>
        ) : null}
        {plan.trade_offs.length ? (
          <section>
            <h4 className="font-sans text-sm font-bold text-forest-900">{t('results.tradeOffs')}</h4>
            <ul className="mt-2 space-y-1.5">
              {plan.trade_offs.map((x, i) => (
                <li key={i} className="flex gap-2 text-[0.95rem]">
                  <AlertTriangle className="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {plan.vs_current_practice ? <VsCurrent vs={plan.vs_current_practice} order={order} /> : null}
      </div>
    </article>
  );
}

/* ------------------------------ no-plan state ------------------------------ */
export function NoPlanState({ rec, onChangeAnswers }: { rec: Recommendation; onChangeAnswers: () => void }) {
  const { t } = useRT();
  return (
    <section className="rounded-3xl border border-forest-900/10 bg-white p-5 sm:p-7" data-testid="no-plan">
      <h2 className="text-2xl">{t('results.noPlansTitle')}</h2>
      {rec.status_note ? <p className="mt-2 text-lg">{rec.status_note}</p> : null}
      {rec.crops_considered.length ? (
        <>
          <h3 className="mt-6 font-sans text-sm font-bold">{t('results.cropsConsidered')}</h3>
          <ul className="mt-2 divide-y divide-forest-900/10">
            {rec.crops_considered.map((c, i) => {
              const ok = c.why_not.length === 0;
              return (
                <li key={i} className="flex gap-3 py-3">
                  {ok ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
                  ) : (
                    <XCircle className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
                  )}
                  <div>
                    <p className="font-semibold">
                      {cropName(c.crop)} <span className="text-sm font-normal text-ink-muted">· {ok ? t('results.suitable') : t('results.notSuitable')}</span>
                    </p>
                    {c.why_not.length ? (
                      <ul className="text-sm text-ink-muted">
                        {c.why_not.map((w, j) => (
                          <li key={j}>{w}</li>
                        ))}
                      </ul>
                    ) : c.eligible_in_seasons.length ? (
                      <p className="text-sm text-ink-muted">{t('results.eligibleSeasons', { seasons: c.eligible_in_seasons.join(', ') })}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <button
        type="button"
        onClick={onChangeAnswers}
        className="mt-6 inline-flex h-12 cursor-pointer items-center rounded-full bg-emerald-600 px-6 font-semibold text-white hover:bg-emerald-700"
        data-testid="no-plan-change"
      >
        {t('results.changeAnswers')}
      </button>
    </section>
  );
}

/* ------------------------------ advanced details ------------------------------ */
export function AdvancedDetails({ site }: { site: Recommendation['site_profile'] }) {
  const { t } = useRT();
  const soil = site.soil;
  const rain = site.rainfall;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const data = rain ? rain.monthly_mean_mm.map((mm, i) => ({ month: months[i], mm })) : [];
  const n = (v: number | null, d = 1) => (v == null ? '—' : v.toFixed(d));
  return (
    <details className="group rounded-2xl border border-forest-900/10 bg-white p-4 sm:p-5" data-testid="advanced">
      <summary className="cursor-pointer text-lg font-semibold text-forest-900">{t('results.advanced')}</summary>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="font-sans text-sm font-bold">{t('results.soil')}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-muted">{t('results.soilPh')}</dt>
              <dd className="font-semibold">{n(soil.ph)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t('results.soilTexture')}</dt>
              <dd className="font-semibold capitalize">{soil.texture_class || '—'}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t('results.soilCarbon')}</dt>
              <dd className="font-semibold">{soil.organic_carbon_g_kg == null ? '—' : `${n(soil.organic_carbon_g_kg)} g/kg`}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t('results.soilClay')}</dt>
              <dd className="font-semibold">
                {n(soil.clay_pct, 0)}% / {n(soil.sand_pct, 0)}% / {n(soil.silt_pct, 0)}%
              </dd>
            </div>
          </dl>
          {soil.source ? <p className="mt-2 text-xs text-ink-muted">{soil.source}</p> : null}

          <h3 className="mt-6 font-sans text-sm font-bold">{t('results.seasonPlan')}</h3>
          <p className="text-sm">
            {Number.isFinite(site.seasons_per_year_used) ? t('results.seasonsPerYear', { n: site.seasons_per_year_used }) : null}
            {site.season_plan.length ? ` · ${site.season_plan.map((s) => `${t('results.season', { n: s.season })}: ${s.plant_month}`).join(' · ')}` : null}
          </p>
          {Number.isFinite(site.distance_to_cell_km) ? (
            <p className="mt-2 text-sm text-ink-muted">{t('results.distance', { km: site.distance_to_cell_km.toFixed(1) })}</p>
          ) : null}
        </section>

        <section>
          <h3 className="font-sans text-sm font-bold">{t('results.rainfall')}</h3>
          {rain ? (
            <>
              <p className="text-sm">{t('results.rainfallAnnual', { mm: fmt(rain.annual_mm), wet: fmt(rain.wet_months_ge_100mm) })}</p>
              <p className="mt-3 text-xs font-semibold text-ink-muted">{t('results.rainfallChart')}</p>
              <div className="mt-1 h-48" data-testid="rain-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="rgb(15 42 34 / 0.08)" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} interval={0} tick={{ fill: '#4a5b53' }} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#4a5b53' }} />
                    <Tooltip cursor={{ fill: 'rgb(15 42 34 / 0.05)' }} formatter={(v) => [`${Math.round(Number(v))} mm`, t('results.rainfall')]} />
                    <Bar dataKey="mm" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-semibold text-emerald-700">{t('results.showTable')}</summary>
                <table className="mt-2 w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="py-1 pr-2">{t('results.month')}</th>
                      <th className="py-1">{t('results.mm')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d) => (
                      <tr key={d.month} className="border-t border-forest-900/10">
                        <td className="py-1 pr-2">{d.month}</td>
                        <td className="py-1 tabular-nums">{fmt(d.mm, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
              {rain.source ? <p className="mt-2 text-xs text-ink-muted">{rain.source}</p> : null}
            </>
          ) : (
            <p className="mt-2 rounded-xl bg-cream-100 p-4 text-sm text-ink-muted" data-testid="no-rainfall">
              {t('results.noRainfall')}
            </p>
          )}
        </section>
      </div>
    </details>
  );
}
