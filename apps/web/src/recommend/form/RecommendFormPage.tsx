import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Info, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { cropName } from '../config/crops';
import { FIXTURE_NAMES, RECOMMEND_MODE, loadFixtureInput } from '../api/recommend';
import { monthName, useRT } from '../i18n';
import { GOALS, PRIORITIES, type FarmerInput } from '../types';
import { Choice, CropChoice, CropMultiSelect, MonthChoice, PriorityScale, Question } from './controls';
import { LocationStep } from './LocationStep';
import { isComplete, loadDevFixture, missingOnStep, saveDevFixture, saveSubmittedInput, toFarmerInput, useDraft, validPh, type Draft } from './draft';

const STEP_KEYS = ['location', 'history', 'conditions', 'priorities', 'review'] as const;
const DEV_TOOLS = import.meta.env.DEV && RECOMMEND_MODE === 'mock';

export default function RecommendFormPage() {
  const { t } = useRT();
  const navigate = useNavigate();
  const { draft, step, update, setStep, replace, reset } = useDraft();
  const [showErrors, setShowErrors] = useState(false);
  const top = useRef<HTMLHeadingElement>(null);

  // Move focus to the step heading on every step change (screen readers + small screens).
  useEffect(() => {
    top.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const goNext = () => {
    if (missingOnStep(step, draft).length) return setShowErrors(true);
    setShowErrors(false);
    setStep(Math.min(step + 1, 4));
  };
  const generate = () => {
    if (!isComplete(draft)) return;
    saveSubmittedInput(toFarmerInput(draft));
    navigate('/recommend/results');
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">{t('title')}</p>
      <h1 ref={top} tabIndex={-1} className="mt-1 text-3xl outline-none sm:text-4xl">
        {t(`steps.${STEP_KEYS[step]}`)}
      </h1>
      {step === 0 ? <p className="mt-2 text-lg text-ink-muted">{t('tagline')}</p> : null}

      <Progress step={step} onJump={(s) => s < step && setStep(s)} />

      <Card className="mt-6 space-y-8 p-5 sm:p-8">
        {step === 0 ? <LocationStep draft={draft} update={update} showErrors={showErrors} /> : null}
        {step === 1 ? <HistoryStep draft={draft} update={update} showErrors={showErrors} /> : null}
        {step === 2 ? <ConditionsStep draft={draft} update={update} showErrors={showErrors} /> : null}
        {step === 3 ? <PrioritiesStep draft={draft} update={update} /> : null}
        {step === 4 ? <ReviewStep draft={draft} onEdit={setStep} /> : null}
      </Card>

      {/* Navigation: big buttons, sticky on phones so they are always reachable */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex gap-3 border-t border-forest-900/10 bg-cream-100/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {step > 0 ? (
          <Button type="button" variant="secondary" size="lg" onClick={() => setStep(step - 1)} data-testid="rec-back">
            <ArrowLeft aria-hidden /> {t('back')}
          </Button>
        ) : null}
        {step < 4 ? (
          <Button type="button" size="lg" className="ml-auto" onClick={goNext} data-testid="rec-next">
            {t('next')} <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button type="button" size="lg" className="ml-auto" onClick={generate} disabled={!isComplete(draft)} data-testid="rec-generate">
            <Sparkles aria-hidden /> {t('review.generate')}
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
        <span>{t('saved')}</span>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 font-semibold underline-offset-4 hover:underline"
          onClick={() => {
            if (window.confirm(t('startOverConfirm'))) reset();
          }}
        >
          <RotateCcw className="size-4" aria-hidden /> {t('startOver')}
        </button>
      </div>

      {DEV_TOOLS ? <DevTools onFill={replace} /> : null}
    </div>
  );
}

function Progress({ step, onJump }: { step: number; onJump: (s: number) => void }) {
  const { t } = useRT();
  return (
    <nav aria-label={t('progress', { step: step + 1, total: STEP_KEYS.length })} className="mt-6">
      <p className="text-sm font-semibold text-ink-muted" data-testid="rec-progress">
        {t('progress', { step: step + 1, total: STEP_KEYS.length })}
      </p>
      <ol className="mt-2 grid grid-cols-5 gap-1.5">
        {STEP_KEYS.map((k, i) => (
          <li key={k}>
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={i >= step}
              aria-current={i === step ? 'step' : undefined}
              className={cn('block w-full text-left disabled:cursor-default', i < step && 'cursor-pointer')}
            >
              <span className={cn('block h-2 rounded-full', i <= step ? 'bg-emerald-600' : 'bg-forest-900/10')} />
              <span className={cn('mt-1.5 hidden text-xs font-semibold sm:block', i === step ? 'text-forest-900' : 'text-ink-muted')}>{t(`steps.${k}`)}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

type StepProps = { draft: Draft; update: (d: Draft) => void; showErrors?: boolean };

function HistoryStep({ draft, update, showErrors }: StepProps) {
  const { t } = useRT();
  const unknown = t('unknown');
  const req = (v: unknown) => (showErrors && v === undefined ? t('history.required') : null);
  return (
    <>
      <Question id="current_crop" label={t('history.current')} error={req(draft.current_crop)}>
        <CropChoice
          value={draft.current_crop}
          onChange={(v) => update({ current_crop: v })}
          extras={[
            { value: 'fallow', label: t('history.fallow') },
            { value: 'other', label: t('history.other') },
            { value: 'unknown', label: unknown, muted: true },
          ]}
          testId="current"
        />
      </Question>
      <Question id="harvest_month" label={t('history.harvest')}>
        <MonthChoice<'already_harvested' | null>
          value={draft.harvest_month}
          onChange={(v) => update({ harvest_month: v })}
          extras={[
            { value: 'already_harvested', label: t('history.alreadyHarvested') },
            { value: null, label: unknown, muted: true },
          ]}
          testId="harvest"
        />
      </Question>
      <Question id="previous_crop" label={t('history.previous')}>
        <CropChoice
          value={draft.previous_crop}
          onChange={(v) => update({ previous_crop: v })}
          extras={[
            { value: 'fallow', label: t('history.fallow') },
            { value: 'unknown', label: t('history.dontRemember'), muted: true },
          ]}
          testId="previous"
        />
      </Question>
      <Question id="previous_crop_2" label={t('history.previous2')}>
        <CropChoice
          value={draft.previous_crop_2}
          onChange={(v) => update({ previous_crop_2: v })}
          extras={[
            { value: 'fallow', label: t('history.fallow') },
            { value: 'unknown', label: t('history.dontRemember'), muted: true },
          ]}
          testId="previous2"
        />
      </Question>
      <Question id="next_planting_month" label={t('history.nextPlanting')} error={req(draft.next_planting_month)}>
        <MonthChoice<null>
          value={draft.next_planting_month}
          onChange={(v) => update({ next_planting_month: v })}
          extras={[{ value: null, label: t('history.notSure'), muted: true }]}
          testId="next"
        />
      </Question>
      <Question id="seasons_per_year" label={t('history.seasons')}>
        <Choice<1 | 2 | 3 | null>
          value={draft.seasons_per_year}
          onChange={(v) => update({ seasons_per_year: v })}
          options={[
            { value: 1, label: t('history.season_1') },
            { value: 2, label: t('history.season_2') },
            { value: 3, label: t('history.season_3') },
            { value: null, label: unknown, muted: true },
          ]}
          columns={4}
          testId="seasons"
        />
      </Question>
    </>
  );
}

function ConditionsStep({ draft, update, showErrors }: StepProps) {
  const { t } = useRT();
  const unknown = { value: 'unknown' as const, label: t('unknown'), muted: true };
  const [ph, setPh] = useState(draft.soil_ph == null ? '' : String(draft.soil_ph));
  const phN = ph.trim() === '' ? null : Number.parseFloat(ph.replace(',', '.'));
  const phBad = phN !== null && !validPh(phN);
  return (
    <>
      <Question id="water_access" label={t('conditions.water')} error={showErrors && draft.water_access === undefined ? t('conditions.required') : null}>
        <Choice
          value={draft.water_access}
          onChange={(v) => update({ water_access: v })}
          options={[
            { value: 'rainfall_only' as const, label: t('conditions.water_rainfall_only') },
            { value: 'limited_irrigation' as const, label: t('conditions.water_limited_irrigation') },
            { value: 'reliable_irrigation' as const, label: t('conditions.water_reliable_irrigation') },
            unknown,
          ]}
          testId="water"
        />
      </Question>
      <Question id="waterlogging" label={t('conditions.waterlogging')}>
        <Choice
          value={draft.waterlogging}
          onChange={(v) => update({ waterlogging: v })}
          options={[
            { value: 'weeks' as const, label: t('conditions.waterlogging_weeks') },
            { value: 'days' as const, label: t('conditions.waterlogging_days') },
            { value: 'none' as const, label: t('conditions.waterlogging_none') },
            unknown,
          ]}
          testId="waterlogging"
        />
      </Question>
      <Question id="input_level" label={t('conditions.inputs')}>
        <Choice
          value={draft.input_level}
          onChange={(v) => update({ input_level: v })}
          options={[
            { value: 'minimal' as const, label: t('conditions.inputs_minimal') },
            { value: 'moderate' as const, label: t('conditions.inputs_moderate') },
            { value: 'high' as const, label: t('conditions.inputs_high') },
            unknown,
          ]}
          testId="inputs"
        />
      </Question>
      <Question id="soil_texture" label={t('conditions.soil')}>
        <Choice
          value={draft.soil_texture}
          onChange={(v) => update({ soil_texture: v })}
          options={[
            { value: 'clay' as const, label: t('conditions.soil_clay') },
            { value: 'loam' as const, label: t('conditions.soil_loam') },
            { value: 'sandy' as const, label: t('conditions.soil_sandy') },
            { value: 'silt' as const, label: t('conditions.soil_silt') },
            unknown,
          ]}
          testId="soil"
        />
      </Question>
      <Question
        id="soil_ph"
        label={t('conditions.ph')}
        help={t('conditions.phHelp')}
        error={(showErrors || phBad) && !validPh(draft.soil_ph ?? phN) ? t('conditions.phRange') : null}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="h-12 w-36 rounded-xl border border-forest-900/20 bg-white px-4"
            inputMode="decimal"
            value={ph}
            aria-label={t('conditions.ph')}
            aria-invalid={phBad}
            data-testid="soil-ph"
            onChange={(e) => {
              setPh(e.target.value);
              const v = e.target.value.trim() === '' ? null : Number.parseFloat(e.target.value.replace(',', '.'));
              update({ soil_ph: v === null || Number.isNaN(v) ? (e.target.value.trim() === '' ? null : Number.NaN) : v });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPh('');
              update({ soil_ph: null });
            }}
          >
            {t('conditions.phNone')}
          </Button>
        </div>
      </Question>
    </>
  );
}

function PrioritiesStep({ draft, update }: StepProps) {
  const { t } = useRT();
  const levels = PRIORITIES.map((p) => ({ value: p, label: t(`priorities.levels.${p}`) }));
  return (
    <>
      <Question id="excluded_crops" label={t('priorities.excluded')} help={t('priorities.excludedHelp')}>
        <CropMultiSelect value={draft.excluded_crops ?? []} onChange={(v) => update({ excluded_crops: v })} />
      </Question>
      <Question id="priorities" label={t('priorities.label')} help={t('priorities.help')}>
        <div className="space-y-3">
          {GOALS.map((g) => (
            <PriorityScale
              key={g}
              label={t(`goals.${g}`)}
              levels={levels}
              value={draft.priorities?.[g] ?? 'important'}
              onChange={(v) => update({ priorities: { ...draft.priorities!, [g]: v } })}
              testId={`priority-${g}`}
            />
          ))}
        </div>
      </Question>
    </>
  );
}

/** Human-readable answer for the review screen. */
function useAnswerText() {
  const { t } = useRT();
  const unknown = t('unknown');
  const na = t('notAnswered');
  const crop = (v: string | undefined, unknownText = unknown) =>
    v === undefined ? na : v === 'unknown' ? unknownText : v === 'fallow' ? t('history.fallow') : v === 'other' ? t('history.other') : cropName(v);
  const month = (v: number | string | null | undefined, nullText = unknown) =>
    v === undefined ? na : v === null ? nullText : v === 'already_harvested' ? t('history.alreadyHarvested') : monthName(Number(v));
  const choice = (prefix: string, v: string | undefined) => (v === undefined ? na : v === 'unknown' ? unknown : t(`${prefix}${v}`));
  return { crop, month, choice, unknown, na };
}

function ReviewStep({ draft, onEdit }: { draft: Draft; onEdit: (s: number) => void }) {
  const { t } = useRT();
  const a = useAnswerText();
  const sections: { step: number; rows: [string, string][] }[] = [
    { step: 0, rows: [[t('location.chosen'), draft.location ? `${draft.location.lat.toFixed(4)}, ${draft.location.lon.toFixed(4)}` : a.na]] },
    {
      step: 1,
      rows: [
        [t('history.current'), a.crop(draft.current_crop)],
        [t('history.harvest'), a.month(draft.harvest_month)],
        [t('history.previous'), a.crop(draft.previous_crop, t('history.dontRemember'))],
        [t('history.previous2'), a.crop(draft.previous_crop_2, t('history.dontRemember'))],
        [t('history.nextPlanting'), a.month(draft.next_planting_month, t('history.notSure'))],
        [
          t('history.seasons'),
          draft.seasons_per_year === undefined ? a.na : draft.seasons_per_year === null ? a.unknown : t(`history.season_${draft.seasons_per_year}`),
        ],
      ],
    },
    {
      step: 2,
      rows: [
        [t('conditions.water'), a.choice('conditions.water_', draft.water_access)],
        [t('conditions.waterlogging'), a.choice('conditions.waterlogging_', draft.waterlogging)],
        [t('conditions.inputs'), a.choice('conditions.inputs_', draft.input_level)],
        [t('conditions.soil'), a.choice('conditions.soil_', draft.soil_texture)],
        [t('conditions.ph'), draft.soil_ph == null ? t('conditions.phNone') : String(draft.soil_ph)],
      ],
    },
    {
      step: 3,
      rows: [
        [t('priorities.excluded'), draft.excluded_crops?.length ? draft.excluded_crops.map(cropName).join(', ') : t('priorities.excludedNone')],
        ...GOALS.map((g): [string, string] => [t(`goals.${g}`), t(`priorities.levels.${draft.priorities?.[g] ?? 'important'}`)]),
      ],
    },
  ];
  return (
    <div className="space-y-6" data-testid="rec-review">
      <p className="flex gap-3 rounded-xl bg-sky-100 p-4 text-[#1c4f7a]">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden /> {t('review.notice')}
      </p>
      {!isComplete(draft) ? (
        <p role="alert" className="font-semibold text-critical">
          {t('review.missing')}
        </p>
      ) : null}
      {sections.map((s) => (
        <section key={s.step} className="rounded-2xl border border-forest-900/10 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl">{t(`steps.${STEP_KEYS[s.step]}`)}</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(s.step)} data-testid={`rec-edit-${s.step}`}>
              <Pencil aria-hidden /> {t('edit')}
            </Button>
          </div>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {s.rows.map(([q, v]) => (
              <div key={q}>
                <dt className="text-sm text-ink-muted">{q}</dt>
                <dd className={cn('font-semibold', v === a.na && 'text-warning')}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/** Dev only (vite dev server + mock mode): pick a fixture and pre-fill answers from its input file. */
function DevTools({ onFill }: { onFill: (d: Partial<FarmerInput>) => void }) {
  const { t } = useRT();
  const [fixture, setFixture] = useState(loadDevFixture);
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-warning/60 bg-[#fdf6e7] p-4 text-sm" data-testid="rec-devtools">
      <p className="font-semibold text-warning">{t('dev.mode', { mode: RECOMMEND_MODE })}</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="font-semibold">
          {t('dev.fixture')}
          <select
            className="mt-1 block h-10 rounded-lg border border-forest-900/20 bg-white px-2"
            value={fixture}
            onChange={(e) => {
              setFixture(e.target.value);
              saveDevFixture(e.target.value);
            }}
            data-testid="rec-dev-fixture"
          >
            <option value="">{t('dev.auto')}</option>
            {FIXTURE_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!fixture}
          onClick={async () => {
            const input = await loadFixtureInput(fixture);
            if (input) onFill(input);
          }}
        >
          {t('dev.fill')}
        </Button>
      </div>
    </div>
  );
}
