import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  CalendarClock,
  CloudRain,
  Coins,
  Droplets,
  FlaskConical,
  HandHeart,
  History,
  Layers,
  Leaf,
  MapPin,
  Moon,
  Package,
  Repeat,
  Shield,
  Sparkles,
  Sprout,
  Thermometer,
  Waves,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import type { RotationComparisonResponse, RotationStep, Strategy } from '@fieldverse/contracts';
import { CropImage, cropLabel } from '@/components/CropVisual';
import { FeasibilityPill } from '@/components/Provenance';
import { CountUp } from '@/components/CountUp';
import { useCropMap, useRegions } from '@/hooks/queries';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { FarmProfile } from '@/contexts/FarmContext';
import { describeAnswers } from '@/lib/farmAnswers';
import { cn, formatDate, listMonths, MONTHS_SHORT } from '@/lib/utils';

type Answers = Parameters<typeof describeAnswers>[0];

/* ------------------------------------------------------------------ parsing the engine's text into per-season details */

/** "Season 1 (Sorghum): cooler than ideal…" → season 1. Fallow notes have no crop: "Season 2: left fallow…". */
const SEASON_NOTE = /^Season (\d+)(?: \([^)]*\))?:\s*([\s\S]*)$/;
/** "Season 1 – Sorghum: suitability 14/100, rain fit good." (engine explanation details) */
const SEASON_FIT = /^Season (\d+)\s*[–-][^:]*:\s*suitability (\d+)\/100, rain fit (\w+)/;

function seasonDetails(s: Strategy) {
  const notes = new Map<number, string[]>();
  const general: string[] = [];
  for (const r of s.risks) {
    const m = SEASON_NOTE.exec(r.text);
    if (m) notes.set(Number(m[1]), [...(notes.get(Number(m[1])) ?? []), m[2].trim()]);
    else general.push(r.text);
  }
  const fit = new Map<number, { score: number; rain: string }>();
  for (const d of s.explanation.details ?? []) {
    const m = SEASON_FIT.exec(d);
    if (m) fit.set(Number(m[1]), { score: Number(m[2]), rain: m[3] });
  }
  return { notes, general, fit };
}

/** "Title: body" benefit text from the engine; demo benefits may have no title. */
function splitBenefit(text: string) {
  const i = text.indexOf(': ');
  return i > 0 && i < 70 ? { title: text.slice(0, i), body: text.slice(i + 2) } : { title: null, body: text };
}

/** Each kind of benefit gets its own colour, so the cards are easy to tell apart at a glance. */
type BenefitStyle = { icon: LucideIcon; tag: string; card: string; badge: string; accent: string; num: string };
const BENEFIT_STYLES: Record<string, BenefitStyle> = {
  nitrogen: { icon: Leaf, tag: 'Feeds the soil', card: 'from-[#e6f7ec] to-[#cdeedb] border-[#2f9e62]', badge: 'bg-[#1f8a52]', accent: 'text-[#13623a]', num: 'bg-[#1f8a52] text-white' },
  water: { icon: Droplets, tag: 'Saves water', card: 'from-[#e6f2fd] to-[#cde3f8] border-[#2a78d6]', badge: 'bg-[#2a78d6]', accent: 'text-[#164f8f]', num: 'bg-[#2a78d6] text-white' },
  familiar: { icon: HandHeart, tag: 'You know this crop', card: 'from-[#fdecef] to-[#f9d6dd] border-[#d4506b]', badge: 'bg-[#c9415d]', accent: 'text-[#8c2238]', num: 'bg-[#c9415d] text-white' },
  income: { icon: Coins, tag: 'Income', card: 'from-[#fdf4dc] to-[#f8e3b0] border-[#d4a24c]', badge: 'bg-[#b8862f]', accent: 'text-[#6d4f12]', num: 'bg-[#b8862f] text-white' },
  risk: { icon: Shield, tag: 'Less risk', card: 'from-[#f1ecfb] to-[#e0d5f5] border-[#7a55c7]', badge: 'bg-[#6c47b8]', accent: 'text-[#46288a]', num: 'bg-[#6c47b8] text-white' },
  soil: { icon: Sprout, tag: 'Healthier soil', card: 'from-[#f1f8e2] to-[#ddefbf] border-[#7aa834]', badge: 'bg-[#5f8f1f]', accent: 'text-[#3f6311]', num: 'bg-[#5f8f1f] text-white' },
  food: { icon: Wheat, tag: 'Food for the family', card: 'from-[#fdf0e3] to-[#fbdcc0] border-[#e07a45]', badge: 'bg-[#d0632b]', accent: 'text-[#8a3413]', num: 'bg-[#d0632b] text-white' },
  other: { icon: Sparkles, tag: 'Benefit', card: 'from-[#e5f6f4] to-[#c9ece7] border-[#1f9c8c]', badge: 'bg-[#178577]', accent: 'text-[#0d5a50]', num: 'bg-[#178577] text-white' },
};

function benefitStyle(text: string): BenefitStyle {
  const t = text.toLowerCase();
  if (/already grow|seed, skills|market links|familiar/.test(t)) return BENEFIT_STYLES.familiar;
  if (/food|household|protein|dietary/.test(t)) return BENEFIT_STYLES.food;
  if (/nitrogen|legume|fix/.test(t)) return BENEFIT_STYLES.nitrogen;
  if (/water|rain|dry/.test(t)) return BENEFIT_STYLES.water;
  if (/income|price|sell|market/.test(t)) return BENEFIT_STYLES.income;
  if (/risk|spread|failure/.test(t)) return BENEFIT_STYLES.risk;
  if (/soil|cover|organic/.test(t)) return BENEFIT_STYLES.soil;
  return BENEFIT_STYLES.other;
}

/** Make the numbers that matter (23%, 450-700 mm, 2 °C) stand out inside the sentence. */
const KEY_NUMBER = /(\d[\d,.]*(?:\s?[–-]\s?\d[\d,.]*)?\s?(?:%|mm|°C))/g;
function Highlighted({ text, cls }: { text: string; cls: string }) {
  const parts = text.split(KEY_NUMBER);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className={cn('mx-0.5 whitespace-nowrap rounded-md px-1.5 py-px font-bold', cls)}>
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const RAIN_FIT: Record<string, { label: string; cls: string }> = {
  good: { label: 'Rain is enough', cls: 'bg-sky-100 text-[#1c4f7a]' },
  marginal: { label: 'Rain is tight', cls: 'bg-gold-100 text-[#6d4f12]' },
  poor: { label: 'Too dry without watering', cls: 'bg-[#fde7dc] text-[#8a3413]' },
};

/* ------------------------------------------------------------------ card */

export function DecisionCard({
  analysis,
  farmName,
  constraints,
  currentCrop,
  additions,
  profile,
}: {
  analysis: RotationComparisonResponse;
  farmName: string;
  constraints: FarmProfile['constraints'];
  currentCrop: string;
  additions: FarmProfile['planAdditions'];
  /** Farmer answers (spec form) to print on the card. */
  profile: Answers | null;
}) {
  const { t } = useTranslation();
  const { map } = useCropMap();
  const regions = useRegions();
  const region = regions.data?.find((r) => r.id === analysis.region.id);
  const checks = [...new Set(analysis.strategies.flatMap((s) => s.localChecks))];

  return (
    <article className="print-card rounded-3xl border border-forest-900/10 bg-[#f7f8f5]/95 p-5 shadow-[var(--shadow-card)] sm:p-7" data-testid="decision-card">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-forest-900/10 pb-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">FieldVerse decision card</p>
          <h2 className="text-3xl">{farmName}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-ink-muted">
            <MapPin className="size-4" aria-hidden /> {region?.name ?? analysis.region.name}
          </p>
        </div>
        <div className="text-right text-sm text-ink-muted">
          {analysis.mode === 'demo' ? (
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-gold-100 px-3 py-1 font-bold text-[#6d4f12]">
              <FlaskConical className="size-4" aria-hidden /> ILLUSTRATIVE DEMO — not a prediction
            </span>
          ) : null}
          <p>Generated {formatDate(analysis.generatedAt)}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---------------- Left: rotation options ---------------- */}
        <section aria-labelledby="dc-options">
          <h3 id="dc-options" className="flex items-center gap-2 text-xl">
            <Repeat className="size-5 text-emerald-700" aria-hidden /> Rotation options
          </h3>
          <p className="mt-1 text-sm text-ink-muted">Each picture is one season in your field, from planting to harvest. Under each crop is what the analysis says about it.</p>
          {/* The engine moved the planting month because the farmer's month had too few workable crops. */}
          {analysis.limitations
            .filter((l) => /these plans start in/i.test(l))
            .map((l) => (
              <p key={l} role="note" className="mt-3 flex gap-2 rounded-2xl bg-gold-100 p-3 text-sm text-[#5a4210]">
                <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden /> {l}
              </p>
            ))}
          <div className="mt-4 space-y-6">
            {analysis.strategies.map((s, i) => (
              <OptionCard key={s.id} strategy={s} index={i} />
            ))}
          </div>

          {additions.length ? (
            <ExtraBlock title="Ideas for idle months" icon={CalendarClock}>
              {additions.map((a, i) => (
                <li key={i}>
                  <strong>{cropLabel(map, a.cropId)}</strong> in {listMonths(a.months)}
                </li>
              ))}
            </ExtraBlock>
          ) : null}
          {constraints.length ? (
            <ExtraBlock title="My corrections" icon={HandHeart}>
              {constraints.map((c, i) => (
                <li key={i}>
                  {t(`constraints.${c.type}`)}
                  {c.cropId ? `: ${cropLabel(map, c.cropId)}` : ''}
                  {c.note ? ` — “${c.note}”` : ''}
                </li>
              ))}
            </ExtraBlock>
          ) : null}
          {checks.length ? (
            <ExtraBlock title="Check locally before deciding" icon={AlertTriangle}>
              {checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ExtraBlock>
          ) : null}
        </section>

        {/* ---------------- Right: farm details ---------------- */}
        <FarmPanel analysis={analysis} currentCrop={currentCrop} profile={profile} />
      </div>

      <footer className="mt-8 border-t border-forest-900/10 pt-3 text-xs text-ink-muted">
        <p>{analysis.disclaimer}</p>
        <p className="mt-1">Sources: {analysis.dataSources.map((s) => `${s.name} (${s.sourceType})`).join('; ')}.</p>
      </footer>
    </article>
  );
}

function ExtraBlock({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid rounded-2xl border border-forest-900/10 bg-white/80 p-4">
      <h3 className="flex items-center gap-2 text-lg">
        <Icon className="size-5 text-emerald-700" aria-hidden /> {title}
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.95rem]">{children}</ul>
    </section>
  );
}

/* ------------------------------------------------------------------ one option */

const MEDAL = ['bg-gradient-to-br from-[#f3d27a] to-[#c8952e] text-[#4a3207]', 'bg-gradient-to-br from-[#e6ebe8] to-[#a9b4af] text-forest-900', 'bg-gradient-to-br from-[#e9b48a] to-[#a8683c] text-[#3d2210]'];

function OptionCard({ strategy: s, index }: { strategy: Strategy; index: number }) {
  const { map } = useCropMap();
  const { notes, general, fit } = seasonDetails(s);
  const rank = s.priorityFit?.rank ?? index + 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="break-inside-avoid overflow-hidden rounded-3xl border border-forest-900/10 bg-white/90 shadow-[var(--shadow-card)]"
      data-testid="dc-option"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-full text-lg font-black shadow-sm', MEDAL[rank - 1] ?? 'bg-cream-200 text-forest-900')} aria-label={`Number ${rank} for your priorities`}>
          {rank}
        </span>
        <div className="min-w-[12rem] flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{rank === 1 ? 'Best fit for your priorities' : `#${rank} for your priorities`}</p>
          <p className="text-lg font-semibold leading-snug text-forest-900">
            {s.steps.map((st) => cropLabel(map, st.cropId).replace(/\s*\(.*\)/, '')).join(' → ')}
          </p>
        </div>
        <FeasibilityPill status={s.feasibility.status} className="px-2.5 py-1 text-xs" />
      </div>

      {/* The field through the seasons */}
      <ol className="mt-4 grid gap-3 px-5 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]" aria-label="Seasons in this option">
        {s.steps.map((st, i) => (
          <SeasonPlot key={i} step={st} index={i} notes={notes.get(i + 1) ?? []} fit={fit.get(i + 1)} />
        ))}
      </ol>

      {/* Why it could work */}
      {s.benefits.length ? (
        <div className="mt-6 px-5">
          <h4 className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#1f8a52] to-[#2a9d8f] py-1.5 pl-2 pr-4 text-base font-bold text-white shadow-sm">
            <span className="grid size-7 place-items-center rounded-full bg-white/20">
              <Sparkles className="size-4" aria-hidden />
            </span>
            Why it could work
          </h4>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {s.benefits.slice(0, 4).map((b, i) => {
              const { title, body } = splitBenefit(b.text);
              const st = benefitStyle(b.text);
              const Icon = st.icon;
              return (
                <motion.li
                  key={b.text}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + i * 0.08, duration: 0.35 }}
                  className={cn('break-inside-avoid rounded-2xl border-l-[5px] bg-gradient-to-br p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md', st.card)}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-md', st.badge)}>
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className={cn('text-[0.7rem] font-bold uppercase tracking-wider', st.accent)}>{st.tag}</p>
                      {title ? <p className="text-base font-bold leading-snug text-forest-900">{title}</p> : null}
                    </div>
                  </div>
                  <p className="mt-2.5 text-[0.95rem] leading-relaxed text-[#23362e]">
                    <Highlighted text={body} cls={st.num} />
                  </p>
                </motion.li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {general.length ? (
        <div className="mt-4 px-5">
          <p className="text-sm font-bold uppercase tracking-wider text-[#8a3413]">Watch out for</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {general.slice(0, 4).map((r) => (
              <li key={r} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="h-5" />
    </motion.div>
  );
}

/** One season as a little picture of the field: sky, the crop growing out of the soil, and its months. */
function SeasonPlot({ step, index, notes, fit }: { step: RotationStep; index: number; notes: string[]; fit?: { score: number; rain: string } }) {
  const { map } = useCropMap();
  const { calmMotion } = usePreferences();
  const fallow = step.cropId === 'fallow';
  const name = fallow ? 'The land rests' : cropLabel(map, step.cropId).replace(/\s*\(.*\)/, '');
  const months = `${MONTHS_SHORT[step.season.startMonth - 1]} – ${MONTHS_SHORT[step.season.endMonth - 1]}`;
  const rain = fit ? RAIN_FIT[fit.rain] : undefined;
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-forest-900/10 bg-[#fbfcfa]" data-testid="dc-season">
      <div className={cn('relative h-32 overflow-hidden', fallow ? 'bg-gradient-to-b from-[#26345e] to-[#4a5a86]' : 'bg-gradient-to-b from-[#cfe8f7] to-[#f1f8ec]')}>
        {fallow ? (
          <>
            {[
              [14, 18],
              [70, 12],
              [40, 30],
              [85, 40],
            ].map(([x, y]) => (
              <span key={`${x}-${y}`} className="absolute size-1 rounded-full bg-white/80" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden />
            ))}
            <Moon className="absolute right-3 top-3 size-6 text-[#f6dd8c]" aria-hidden />
          </>
        ) : (
          <span className="absolute right-3 top-3 size-6 rounded-full bg-[#ffd36b] shadow-[0_0_18px_6px_rgb(255_211_107/0.55)]" aria-hidden />
        )}
        <span className="absolute left-3 top-2.5 rounded-full bg-white/80 px-2 py-0.5 text-[0.7rem] font-bold text-forest-900">Season {index + 1}</span>
        <motion.div
          className="absolute inset-x-0 bottom-1 flex justify-center"
          initial={calmMotion ? false : { y: 46, scale: 0.55, opacity: 0 }}
          whileInView={{ y: 0, scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 + index * 0.2, type: 'spring', stiffness: 110, damping: 13 }}
        >
          <div className={cn(!fallow && 'fv-sway')} style={{ animationDelay: `${index * 0.6}s` }}>
            {fallow ? (
              <span className="grid size-[4.5rem] place-items-center text-[#d9c7a8]" aria-label="Fallow: the field rests with no crop" role="img">
                <Leaf className="size-10 opacity-70" aria-hidden />
              </span>
            ) : (
              <CropImage crop={map.get(step.cropId)} cropId={step.cropId} size={76} className="bg-transparent" />
            )}
          </div>
        </motion.div>
      </div>
      <div className="flex h-7 items-center justify-center bg-gradient-to-b from-soil-500 to-soil-700 text-xs font-semibold tracking-wide text-white">{months}</div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="font-semibold leading-tight text-forest-900">{name}</p>
        {fit ? (
          <div>
            <div className="flex justify-between text-xs text-ink-muted">
              <span>Suits this field</span>
              <span className="font-bold text-forest-900">{fit.score}/100</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream-200" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fit.score} aria-label={`${name} suits this field: ${fit.score} out of 100`}>
              <motion.div
                className={cn('h-full rounded-full', fit.score >= 70 ? 'bg-emerald-600' : fit.score >= 45 ? 'bg-gold-500' : 'bg-[#e07a45]')}
                initial={calmMotion ? false : { width: 0 }}
                whileInView={{ width: `${Math.max(4, fit.score)}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + index * 0.2, duration: 0.8, ease: 'easeOut' }}
                style={calmMotion ? { width: `${Math.max(4, fit.score)}%` } : undefined}
              />
            </div>
          </div>
        ) : null}
        {rain ? (
          <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', rain.cls)}>
            <Droplets className="size-3.5" aria-hidden /> {rain.label}
          </span>
        ) : null}
        {notes.length ? (
          <ul className="space-y-1.5 text-sm leading-snug text-[#33463d]">
            {notes.map((n) => (
              <li key={n} className="flex gap-1.5">
                <AlertTriangle className="mt-px size-3.5 shrink-0 text-gold-600" aria-hidden />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ farm details */

const ANSWER_META: Record<string, { label: string; icon: LucideIcon }> = {
  current_crop: { label: 'Growing now', icon: Sprout },
  harvest_month: { label: 'Harvest', icon: CalendarCheck },
  previous_crop: { label: 'Last season', icon: History },
  previous_crop_2: { label: 'Season before', icon: History },
  next_planting_month: { label: 'Next planting', icon: CalendarClock },
  seasons_per_year: { label: 'Seasons a year', icon: Repeat },
  water_access: { label: 'Water', icon: Droplets },
  waterlogging: { label: 'Standing water', icon: Waves },
  input_level: { label: 'Farm inputs', icon: Package },
  soil_texture: { label: 'Soil type', icon: Layers },
  soil_ph: { label: 'Your soil test pH', icon: FlaskConical },
  excluded_crops: { label: "Won't grow", icon: Ban },
};

/** "Minimal: little or no fertiliser…" → "Minimal"; "Limited irrigation (not…)" → "Limited irrigation". */
function shortAnswer(v: string) {
  return v.split(/[:(]/)[0].trim() || v;
}

function FarmPanel({ analysis, currentCrop, profile }: { analysis: RotationComparisonResponse; currentCrop: string; profile: Answers | null }) {
  const { t } = useTranslation();
  const { map } = useCropMap();
  const env = analysis.environment;
  const hl = env?.highlights;
  const rain = hl?.annualRainfallMm?.value ?? null;
  const temp = hl?.meanTemperatureC?.value ?? null;
  const ph = hl?.topsoilPh?.value ?? null;
  const carbon = hl?.topsoilOrganicCarbonGPerKg?.value ?? null;
  const monthly = env?.climate?.monthly ?? [];
  const maxRain = Math.max(1, ...monthly.map((m) => m.rainfallMm ?? 0));
  const answers = profile ? describeAnswers(profile, t, map) : [];

  return (
    <aside aria-labelledby="dc-farm" className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-forest-800 to-emerald-700 p-5 text-cream-50 shadow-[var(--shadow-card)]">
        <h3 id="dc-farm" className="flex items-center gap-2 text-xl text-cream-50">
          <Sprout className="size-5 text-gold-500" aria-hidden /> Farm details
        </h3>
        <div className="mt-3 flex items-center gap-3">
          <CropImage crop={map.get(currentCrop)} cropId={currentCrop} size={56} className="bg-white/15" />
          <div>
            <p className="text-xs uppercase tracking-wider text-cream-50/75">Growing now</p>
            <p className="text-lg font-semibold">{cropLabel(map, currentCrop)}</p>
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm">
          <span className="text-cream-50/75">Climate: </span>
          {analysis.scenario.label}
        </p>
      </div>

      {/* Climate and soil, from the data sources */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={CloudRain} tone="bg-gradient-to-br from-[#e3f0fb] to-[#cfe4f5] text-[#1c4f7a]" label="Rain per year" source="NASA POWER" value={rain} digits={0} suffix=" mm" />
        <StatTile icon={Thermometer} tone="bg-gradient-to-br from-[#fdf0e6] to-[#fbdcc8] text-[#8a3413]" label="Average temperature" source="NASA POWER" value={temp} digits={1} suffix=" °C" />
        <StatTile icon={FlaskConical} tone="bg-gradient-to-br from-[#f1ecfa] to-[#e1d6f3] text-[#4b2f86]" label="Topsoil pH" source="SoilGrids estimate" value={ph} digits={1}>
          {ph != null ? <PhBar ph={ph} /> : null}
        </StatTile>
        <StatTile icon={Layers} tone="bg-gradient-to-br from-[#f5ece3] to-[#e8d6c4] text-soil-700" label="Organic carbon" source="SoilGrids estimate" value={carbon} digits={0} suffix=" g/kg" />
      </div>

      {monthly.length === 12 ? (
        <div className="rounded-2xl border border-forest-900/10 bg-white/85 p-4">
          <p className="text-sm font-semibold text-forest-900">Rain by month</p>
          <p className="text-xs text-ink-muted">Average millimetres, NASA POWER</p>
          <div className="mt-3 flex h-20 items-end gap-1" role="img" aria-label={`Monthly rain: ${monthly.map((m) => `${MONTHS_SHORT[m.month - 1]} ${Math.round(m.rainfallMm ?? 0)} mm`).join(', ')}`}>
            {monthly.map((m) => (
              <div key={m.month} className="flex h-full flex-1 flex-col justify-end" title={`${MONTHS_SHORT[m.month - 1]}: ${Math.round(m.rainfallMm ?? 0)} mm`}>
                <div className="rounded-t-[4px] bg-series-1" style={{ height: `${Math.max(3, ((m.rainfallMm ?? 0) / maxRain) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1 text-center text-[0.6rem] text-ink-muted" aria-hidden>
            {monthly.map((m) => (
              <span key={m.month} className="flex-1">
                {MONTHS_SHORT[m.month - 1].charAt(0)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {answers.length ? (
        <div className="rounded-2xl border border-forest-900/10 bg-white/85 p-4">
          <p className="font-semibold text-forest-900">Your answers</p>
          <ul className="mt-2 divide-y divide-forest-900/5">
            {answers
              .filter((a) => a.key !== 'current_crop')
              .map((a) => {
                const meta = ANSWER_META[a.key] ?? { label: a.label, icon: Sparkles };
                const Icon = meta.icon;
                return (
                  <li key={a.key} className="flex items-center gap-3 py-2" title={a.label}>
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', a.unknown ? 'bg-cream-200 text-ink-muted' : 'bg-emerald-100 text-emerald-700')}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="flex-1 text-sm text-ink-muted">{meta.label}</span>
                    <span className={cn('text-right text-sm font-semibold', a.unknown ? 'text-ink-muted' : 'text-forest-900')}>{shortAnswer(a.value)}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  source,
  value,
  digits,
  suffix = '',
  children,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  source: string;
  value: number | null;
  digits: number;
  suffix?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('rounded-2xl p-3', tone)}>
      <Icon className="size-5" aria-hidden />
      <p className="mt-1 text-xs font-semibold opacity-80">{label}</p>
      <p className="text-xl font-bold tabular-nums text-forest-900">{value != null ? <CountUp value={value} digits={digits} suffix={suffix} /> : <span className="text-sm text-ink-muted">Not available</span>}</p>
      {children}
      <p className="mt-0.5 text-[0.65rem] opacity-70">{source}</p>
    </div>
  );
}

/** pH position on an acid → alkaline colour bar (3 – 10). */
function PhBar({ ph }: { ph: number }) {
  const pct = Math.min(100, Math.max(0, ((ph - 3) / 7) * 100));
  return (
    <div className="relative mt-1.5 h-2 rounded-full bg-gradient-to-r from-[#e0613a] via-[#7cc576] to-[#5a6fd1]" aria-hidden>
      <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest-900 shadow" style={{ left: `${pct}%` }} />
    </div>
  );
}
