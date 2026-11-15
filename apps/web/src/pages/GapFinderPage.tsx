import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarCheck, Check, Plus, X } from 'lucide-react';
import type { GapCandidate } from '@fieldverse/contracts';
import { FarmSubnav, PageContainer, PageHeader, RequireFarm } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { AnalysisModeNotice, ErrorState, LoadingBlock } from '@/components/StatusStates';
import { CropImage, cropLabel } from '@/components/CropVisual';
import { ProvenanceBadge } from '@/components/Provenance';
import { SourceList } from '@/components/SourceList';
import { useComparison, useCropMap, useGaps, useFarmObservations } from '@/hooks/queries';
import { useFarm } from '@/contexts/FarmContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatNumber, listMonths, MONTHS_SHORT, cn } from '@/lib/utils';

export default function GapFinderPage() {
  return (
    <RequireFarm>
      <GapFinder />
    </RequireFarm>
  );
}

/** Emoji are decoration only: every one sits next to words that say the same thing. */
function Emoji({ children, className }: { children: string; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-block leading-none', className)}>
      {children}
    </span>
  );
}

const FIT = {
  fits: { emoji: '✅', label: 'Fits the gap', band: 'from-[#22a463] to-[#15804b]', chip: 'bg-[#dff5e8] text-[#13623a]' },
  tight: { emoji: '⚡', label: 'Tight — fast varieties only', band: 'from-[#f0a52c] to-[#d27f12]', chip: 'bg-[#fff1d6] text-[#7a520c]' },
  does_not_fit: { emoji: '⛔', label: 'Too long for this gap', band: 'from-[#e5533d] to-[#b8321f]', chip: 'bg-[#fde3e1] text-[#9a2a1a]' },
  unknown: { emoji: '❔', label: 'Unknown fit', band: 'from-[#7b8f99] to-[#5c6f78]', chip: 'bg-cream-200 text-ink-muted' },
} as const;
const ROLE = { short_season: 'Short-season crop', cover: 'Cover crop', fallow: 'Let the land rest' } as const;

function benefitEmoji(text: string) {
  const t = text.toLowerCase();
  if (/legume|nitrogen/.test(t)) return '🫘';
  if (/grain|food/.test(t)) return '🍚';
  if (/dry/.test(t)) return '🌵';
  if (/rest|inputs/.test(t)) return '🛌';
  return '🌿';
}
function riskEmoji(text: string) {
  const t = text.toLowerCase();
  if (/irrigation|dry|moisture|rain/.test(t)) return '💧';
  if (/°c|cold|hot|ideal/.test(t)) return '🌡️';
  if (/already grow/.test(t)) return '👩‍🌾';
  if (/erode|nothing/.test(t)) return '🏜️';
  return '⚠️';
}

const MONTH_IDX: Record<string, number> = Object.fromEntries(MONTHS_SHORT.map((m, i) => [m, i + 1]));

/** The months a crop actually occupies: from its sowing month in the gap, for its typical growing time. Rest = the whole gap. */
function plannedMonths(c: GapCandidate, gap: number[]) {
  const sow = /^Sow in (\w+):/.exec(c.explanation);
  const start = sow ? gap.indexOf(MONTH_IDX[sow[1]] ?? -1) : -1;
  if (start < 0 || !c.durationDays) return gap;
  const len = Math.max(1, Math.ceil(c.durationDays.max / 30.4));
  return gap.slice(start, start + len);
}

/** Sequential single-hue ramp (light → dark blue) for monthly rain; values are always printed too. */
function rainShade(mm: number | null, max: number) {
  if (mm == null) return '#ebe7d9';
  const t = Math.min(1, mm / (max || 1));
  const steps = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
  return steps[Math.min(steps.length - 1, Math.floor(t * steps.length))];
}

const STEPS = [
  { emoji: '👆', title: 'Tap your empty months', text: 'Mark the months when nothing grows in your field.', tone: 'from-[#fff3d6] to-[#ffe3a8]' },
  { emoji: '🔍', title: 'We check every crop', text: 'Is it short enough, warm enough, wet enough, and suited to your area?', tone: 'from-[#e3f0fb] to-[#cbe2f7]' },
  { emoji: '📋', title: 'Add the best to your plan', text: 'Your choices appear on your decision card in My Plan.', tone: 'from-[#e3f6ea] to-[#c9ecd6]' },
];

function GapFinder() {
  const { farm, updateFarm } = useFarm();
  const { map } = useCropMap();
  const { calmMotion } = usePreferences();
  const obs = useFarmObservations(farm);
  const [idle, setIdle] = useState<number[]>(farm!.idleMonths ?? []);
  const q = useGaps(farm, idle);
  // Live NASA observations first; if that lookup has nothing for this place, the engine's monthly climate for the same field.
  const cmp = useComparison(farm);
  const monthly = obs.data?.environment.climate?.monthly ?? cmp.data?.environment?.climate?.monthly;
  const maxRain = Math.max(...(monthly?.map((m) => m.rainfallMm ?? 0) ?? [1]));

  // First visit: suggest idle months = months not covered by the current crop calendar.
  useEffect(() => {
    if (farm!.idleMonths == null && q.data && idle.length === 0) {
      const used = new Set(q.data.currentCalendar.flatMap((c) => c.months));
      const suggestion = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !used.has(m));
      setIdle(suggestion);
      updateFarm({ idleMonths: suggestion });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const toggle = (m: number) => {
    const next = idle.includes(m) ? idle.filter((x) => x !== m) : [...idle, m].sort((a, b) => a - b);
    setIdle(next);
    updateFarm({ idleMonths: next });
  };

  const addToPlan = (c: GapCandidate, gap: number[]) => {
    const months = plannedMonths(c, gap);
    const exists = farm!.planAdditions.some((p) => p.cropId === c.cropId && p.months.join() === months.join());
    if (!exists) updateFarm({ planAdditions: [...farm!.planAdditions, { cropId: c.cropId, months }] });
  };
  const removeFromPlan = (i: number) => updateFarm({ planAdditions: farm!.planAdditions.filter((_, j) => j !== i) });

  const data = q.data;
  // Where the crop row comes from: the farmer's own answers (live engine) or the prepared demo calendar.
  const calendarFromFarmer = (data?.currentCalendar ?? []).some((c) => c.sourceType === 'farmer_provided');

  return (
    <PageContainer>
      <FarmSubnav />
      <PageHeader eyebrow="Gap Finder" title="Is your land idle for part of the year?" intro="Bare months earn nothing and let rain wash the soil away. Mark them below and we'll show short crops, cover crops — or simply resting the land — that could fit." />

      {/* How it works */}
      <ol className="mb-6 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.li
            key={s.title}
            initial={calmMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn('flex items-start gap-3 rounded-2xl bg-gradient-to-br p-4 shadow-sm', s.tone)}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/80 text-2xl shadow-sm">
              <Emoji>{s.emoji}</Emoji>
            </span>
            <div>
              <p className="font-bold text-forest-900">
                {i + 1}. {s.title}
              </p>
              <p className="text-sm text-[#33463d]">{s.text}</p>
            </div>
          </motion.li>
        ))}
      </ol>

      {/* 12-month calendar */}
      <div className="overflow-hidden rounded-3xl bg-white/90 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-[#156e9e] via-[#11806f] to-[#1f8a52] px-5 py-3 text-white sm:px-6">
          <p className="flex items-center gap-2 text-lg font-bold">
            <Emoji>🗓️</Emoji> Your 12-month farm calendar
          </p>
          <p className="text-sm text-white/90">
            <Emoji>👆</Emoji> Tap a month to mark it empty
          </p>
        </div>
        <div className="overflow-x-auto p-4 sm:p-6">
          <table className="w-full min-w-[680px] border-separate border-spacing-[3px] text-center text-sm">
            <caption className="sr-only">Your 12-month farm calendar</caption>
            <thead>
              <tr>
                <th scope="col" className="w-44 text-left text-ink-muted">
                  Month
                </th>
                {MONTHS_SHORT.map((m) => (
                  <th key={m} scope="col" className="font-bold text-forest-900">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="text-left font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Emoji>🌧️</Emoji> Rain (mm)
                  </span>
                </th>
                {Array.from({ length: 12 }, (_, i) => {
                  const mm = monthly?.[i].rainfallMm ?? null;
                  const shade = rainShade(mm, maxRain);
                  const dark = ['#3987e5', '#256abf', '#184f95'].includes(shade);
                  return (
                    <td key={i} className={cn('h-10 rounded-lg text-xs font-bold tabular-nums', dark ? 'text-white' : 'text-forest-900')} style={{ background: shade }}>
                      {mm == null ? '—' : formatNumber(mm)}
                    </td>
                  );
                })}
              </tr>
              {(data?.currentCalendar ?? []).map((c, ci) => (
                <tr key={ci}>
                  <th scope="row" className="text-left font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Emoji>🌱</Emoji> {c.label}
                    </span>
                  </th>
                  {Array.from({ length: 12 }, (_, i) => {
                    const on = c.months.includes(i + 1);
                    const plant = c.plantingMonths.includes(i + 1);
                    const harvest = c.harvestMonths.includes(i + 1);
                    return (
                      <td
                        key={i}
                        className={cn('h-11 rounded-lg text-[11px] font-bold', on ? 'bg-gradient-to-b from-[#22a463] to-[#15804b] text-white' : 'bg-cream-100')}
                        aria-label={on ? `${c.label} in ${MONTHS_SHORT[i]}${plant ? ', planting' : ''}${harvest ? ', harvest' : ''}` : undefined}
                      >
                        {plant ? (
                          <span className="flex flex-col items-center leading-tight">
                            <Emoji className="text-base">🌱</Emoji>Plant
                          </span>
                        ) : harvest ? (
                          <span className="flex flex-col items-center leading-tight">
                            <Emoji className="text-base">🌾</Emoji>Harvest
                          </span>
                        ) : on ? (
                          <Emoji className="text-base">🌿</Emoji>
                        ) : (
                          ''
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="text-left font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Emoji>🟫</Emoji> Empty months (tap)
                  </span>
                </th>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = i + 1;
                  const on = idle.includes(m);
                  return (
                    <td key={i} className="p-0">
                      <motion.button
                        whileTap={calmMotion ? undefined : { scale: 0.85 }}
                        onClick={() => toggle(m)}
                        aria-pressed={on}
                        aria-label={`${MONTHS_SHORT[i]}: ${on ? 'empty' : 'in use'}`}
                        data-testid={`idle-${m}`}
                        className={cn(
                          'grid h-12 w-full cursor-pointer place-items-center rounded-lg border-2 font-bold transition-colors',
                          on ? 'border-[#c98a1c] bg-gradient-to-b from-[#ffd76a] to-[#f2b33a] text-forest-900 shadow-sm' : 'border-dashed border-forest-900/20 bg-white text-ink-muted hover:border-[#f2b33a] hover:bg-[#fff8e6]',
                        )}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={on ? 'on' : 'off'}
                            initial={calmMotion ? false : { scale: 0.3, rotate: -30, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            exit={{ scale: 0.3, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                          >
                            {on ? <Check className="size-5" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                          </motion.span>
                        </AnimatePresence>
                      </motion.button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-muted">
            Rain: NASA POWER monthly average (darker blue = more rain). Crop row:{' '}
            {calendarFromFarmer ? "from your answers (harvest month) and the crop's usual growing time" : 'illustrative demo calendar for this region'}. Empty months:{' '}
            <ProvenanceBadge type="farmer_provided" className="align-middle" />
          </p>
        </div>
      </div>

      <div className="mt-10 space-y-8">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
        {data ? (
          <>
            <AnalysisModeNotice mode={data.mode} modelVersion={data.modelVersion} disclaimer={data.disclaimer} />
            {data.idleWindows.length === 0 ? (
              <p className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#fff3d6] to-[#ffe3a8] p-5 font-semibold text-[#5a4210]">
                <Emoji className="text-2xl">👆</Emoji> Tap at least one empty month in the calendar above to see what could grow.
              </p>
            ) : null}
            {data.idleWindows.map((w, wi) => {
              const cands = data.candidates.filter((c) => c.windowIndex === wi);
              const onlyRest = cands.every((c) => c.cropId === 'fallow');
              return (
                <section key={wi} aria-labelledby={`win-${wi}`} className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 id={`win-${wi}`} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#d27f12] via-[#c95418] to-[#b03f17] py-2 pl-2 pr-5 text-xl text-white shadow-md">
                      <span className="grid size-8 place-items-center rounded-full bg-white/25 text-lg">
                        <Emoji>🕳️</Emoji>
                      </span>
                      Gap {wi + 1}: {listMonths(w.months)}
                    </h2>
                    <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-forest-900 shadow-sm">
                      <Emoji>⏳</Emoji> {w.months.length} month{w.months.length > 1 ? 's' : ''}
                    </span>
                    {w.rainfallMm != null ? (
                      <span className="rounded-full bg-[#e3f0fb] px-3 py-1 text-sm font-semibold text-[#164f8f] shadow-sm">
                        <Emoji>💧</Emoji> about {formatNumber(w.rainfallMm)} mm rain
                      </span>
                    ) : null}
                  </div>
                  {onlyRest ? (
                    <p className="flex gap-3 rounded-2xl bg-gradient-to-r from-[#eef2ff] to-[#e9f6fb] p-4 text-[0.95rem] text-[#22304a]">
                      <Emoji className="text-xl">🧐</Emoji>
                      <span>
                        None of the engine's crops passed all the checks for these months here (too cold, too short, or rated unsuitable for this area), so
                        resting the land is the safe choice. A local cover crop or vegetable your neighbours grow may still work — ask your extension officer.
                      </span>
                    </p>
                  ) : null}
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {cands.map((c, ci) => (
                      <CandidateCard
                        key={c.cropId}
                        c={c}
                        index={ci}
                        months={w.months}
                        added={farm!.planAdditions.some((p) => p.cropId === c.cropId && p.months.join() === plannedMonths(c, w.months).join())}
                        onAdd={() => addToPlan(c, w.months)}
                        name={cropLabel(map, c.cropId)}
                        image={<CropImage crop={map.get(c.cropId)} cropId={c.cropId} size={64} className="bg-white/80" />}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            <AnimatePresence>
              {farm!.planAdditions.length ? (
                <motion.div
                  initial={calmMotion ? false : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="overflow-hidden rounded-3xl bg-white/90 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center gap-2 bg-gradient-to-r from-[#1f8a52] to-[#2a9d8f] px-5 py-3 text-lg font-bold text-white">
                    <Emoji>🎉</Emoji> Added to my plan
                  </div>
                  <ul className="space-y-2 p-5">
                    <AnimatePresence initial={false}>
                      {farm!.planAdditions.map((p, i) => (
                        <motion.li
                          key={`${p.cropId}-${p.months.join()}`}
                          layout
                          initial={calmMotion ? false : { opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          className="flex items-center justify-between gap-2 rounded-2xl bg-gradient-to-r from-[#e3f6ea] to-[#f2faf5] p-3"
                        >
                          <span className="flex items-center gap-3">
                            <CropImage crop={map.get(p.cropId)} cropId={p.cropId} size={40} className="bg-white" />
                            <span>
                              <strong>{cropLabel(map, p.cropId)}</strong> in {listMonths(p.months)}
                            </span>
                          </span>
                          <Button variant="ghost" size="icon" className="size-9" aria-label={`Remove ${cropLabel(map, p.cropId)}`} onClick={() => removeFromPlan(i)}>
                            <X aria-hidden />
                          </Button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                  <div className="px-5 pb-5">
                    <Button asChild>
                      <Link to="/plan">
                        <Emoji>📋</Emoji> Open my decision card
                      </Link>
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <SourceList sources={data.dataSources} limitations={data.limitations} mode={data.mode} modelVersion={data.modelVersion} generatedAt={data.generatedAt} requestId={data.requestId} disclaimer={data.disclaimer} />
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}

function CandidateCard({
  c,
  index,
  added,
  onAdd,
  name,
  image,
}: {
  c: GapCandidate;
  index: number;
  months: number[];
  added: boolean;
  onAdd: () => void;
  name: string;
  image: React.ReactNode;
}) {
  const { calmMotion } = usePreferences();
  const fallow = c.cropId === 'fallow';
  const fit = FIT[c.fit];
  // The engine names the best sowing month inside the gap ("Sow in May: …").
  const sow = /^Sow in (\w+):\s*/.exec(c.explanation);
  const explanation = sow ? c.explanation.slice(sow[0].length) : c.explanation;
  return (
    <motion.div
      initial={calmMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      className="flex flex-col overflow-hidden rounded-3xl bg-white/90 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-1"
      data-testid={`gap-candidate-${c.cropId}`}
    >
      <div className={cn('relative flex items-center gap-3 bg-gradient-to-br px-4 py-4', fallow ? 'from-[#2b3a67] to-[#4a5a86] text-white' : 'from-[#d9eefc] to-[#eef8e8]')}>
        <div className={cn(!fallow && 'fv-sway')} style={{ animationDelay: `${index * 0.5}s` }}>
          {fallow ? (
            <span className="grid size-16 place-items-center rounded-2xl bg-white/15 text-4xl">
              <Emoji>😴</Emoji>
            </span>
          ) : (
            image
          )}
        </div>
        <div className="min-w-0">
          <p className={cn('text-lg font-bold leading-tight', fallow ? 'text-white' : 'text-forest-900')}>{fallow ? 'Let the land rest' : name}</p>
          <p className={cn('text-sm', fallow ? 'text-white/85' : 'text-ink-muted')}>{fallow ? 'No crop — the soil recovers' : ROLE[c.role]}</p>
        </div>
      </div>
      <div className={cn('flex items-center gap-1.5 bg-gradient-to-r px-4 py-1.5 text-sm font-bold text-white', fit.band)}>
        <Emoji>{fit.emoji}</Emoji> {fit.label}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {sow ? (
          <p className="w-fit rounded-full bg-gradient-to-r from-[#22a463] to-[#15804b] px-3 py-1 text-sm font-bold text-white shadow-sm">
            <Emoji>🌱</Emoji> Sow in {sow[1]}
          </p>
        ) : null}
        {c.durationDays ? (
          <p className="text-[0.95rem] text-forest-900">
            <Emoji>⏱️</Emoji> Usually <strong>{c.durationDays.min}–{c.durationDays.max} days</strong> from sowing to harvest
          </p>
        ) : null}
        {c.waterNote ? (
          <p className="rounded-xl bg-[#e3f0fb] px-3 py-2 text-sm font-medium text-[#164f8f]">
            <Emoji>💧</Emoji> {c.waterNote}
          </p>
        ) : null}
        {c.benefits.length ? (
          <ul className="space-y-1.5">
            {c.benefits.map((b) => (
              <li key={b} className="flex gap-2 rounded-xl bg-[#e3f6ea] px-3 py-2 text-sm text-[#13623a]">
                <Emoji>{benefitEmoji(b)}</Emoji>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {c.risks.length ? (
          <ul className="space-y-1.5">
            {c.risks.map((r) => (
              <li key={r} className="flex gap-2 rounded-xl bg-[#fff3e6] px-3 py-2 text-sm text-[#7a3d0c]">
                <Emoji>{riskEmoji(r)}</Emoji>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-sm text-ink-muted">{explanation}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', fit.chip)}>{c.fitMethod === 'rule' ? 'Checked by simple rules' : c.fitMethod === 'model' ? 'Checked by the model' : 'Demo'}</span>
          <Button size="sm" variant={added ? 'secondary' : 'primary'} disabled={added || c.fit === 'does_not_fit'} onClick={onAdd}>
            {added ? (
              <>
                <CalendarCheck aria-hidden /> In plan
              </>
            ) : (
              <>
                <Plus aria-hidden /> Add to plan
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
