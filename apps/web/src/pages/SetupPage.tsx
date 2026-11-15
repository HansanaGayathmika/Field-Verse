/**
 * Farmer input form — implements "Roots of Tomorrow: Farmer Input Form Specification" (Nov 14, 2026).
 * Every question except location offers an "I do not know" option, so a farmer is never blocked.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Coins, Droplets, FlaskConical, Info, LandPlot, Loader2, MapPin, MapPinned, Pencil, Plus, Shield, Soup, Sprout, X } from 'lucide-react';
import type { Region } from '@fieldverse/contracts';
import { PageContainer, PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/primitives';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { CropImage, cropIdFromName, cropLabel } from '@/components/CropVisual';
import { CUSTOM_REGION_ID, useCropMap, useRegions } from '@/hooks/queries';
import { useFarm, comparisonRequest, type FarmProfile, BASELINE } from '@/contexts/FarmContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { api, ApiRequestError } from '@/services/api';
import { describeAnswers } from '@/lib/farmAnswers';
import { regionForLocation } from '@/lib/geo';
import { cn, monthName } from '@/lib/utils';

const LocationPreviewMap = lazy(() => import('@/features/explore/LocationPreviewMap'));

const PRIORITY_KEYS = ['water', 'soilHealth', 'risk', 'income', 'idleLand', 'foodSecurity'] as const;
const PRIORITY_ICONS = { water: Droplets, soilHealth: Sprout, risk: Shield, income: Coins, idleLand: LandPlot, foodSecurity: Soup };
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const required = (msg: string) => z.string().min(1, msg);

/** Form values are strings for the choice controls; they are converted to contract types on submit. */
const FormSchema = z.object({
  farmName: z.string().trim().min(1, 'Please give this field a name').max(80, 'Use 80 characters or fewer'),
  regionId: z.string().min(1, 'Please choose your field location first'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  currentCrop: required('Please choose what you are growing now (or "Fallow").'),
  harvestMonth: z.string(), // '' | '1'..'12' | 'harvested' | 'unknown'
  previousCrop: z.string(), // '' | crop | 'fallow' | 'unknown'
  previousCrop2: z.string(),
  nextPlantingMonth: required('Please choose a month, or "I am not sure".'), // '1'..'12' | 'unsure'
  seasonsPerYear: z.string(), // '' | '1' | '2' | '3' | 'unsure'
  waterAccess: required('Please choose how your field receives water (or "I do not know").'),
  waterlogging: z.string(),
  inputLevel: z.string(),
  soilType: z.string(),
  soilPh: z
    .union([z.number().min(3, 'pH must be between 3.0 and 10.0').max(10, 'pH must be between 3.0 and 10.0'), z.nan()])
    .nullable()
    .transform((v) => (v == null || Number.isNaN(v) ? null : v)),
  excludedCrops: z.array(z.string()),
  priorities: z.object({ water: z.number(), soilHealth: z.number(), risk: z.number(), income: z.number(), idleLand: z.number(), foodSecurity: z.number() }),
  customCrops: z.array(z.string()),
  saveToServer: z.boolean(),
});
type FormValues = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

const STEP_FIELDS: (keyof FormValues)[][] = [
  ['farmName', 'regionId', 'latitude', 'longitude'],
  ['currentCrop', 'harvestMonth', 'previousCrop', 'previousCrop2', 'nextPlantingMonth', 'seasonsPerYear'],
  ['waterAccess', 'waterlogging', 'inputLevel', 'soilType', 'soilPh'],
  ['excludedCrops', 'priorities'],
  [],
];

const toProfileField = (v: FormOutput) => ({
  harvestMonth: v.currentCrop === 'fallow' ? null : v.harvestMonth === 'harvested' ? ('harvested' as const) : /^\d+$/.test(v.harvestMonth) ? Number(v.harvestMonth) : null,
  nextPlantingMonth: /^\d+$/.test(v.nextPlantingMonth) ? Number(v.nextPlantingMonth) : null,
  seasonsPerYear: (['1', '2', '3'].includes(v.seasonsPerYear) ? Number(v.seasonsPerYear) : null) as 1 | 2 | 3 | null,
  cropHistory: [v.previousCrop, v.previousCrop2].filter((c) => c && c !== 'unknown'),
  irrigation: v.waterAccess as FarmProfile['irrigation'],
  waterlogging: (v.waterlogging || 'unknown') as FarmProfile['waterlogging'],
  inputLevel: (v.inputLevel || 'unknown') as FarmProfile['inputLevel'],
  soilType: (v.soilType || 'unknown') as FarmProfile['soilType'],
});

export default function SetupPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const regions = useRegions();
  const crops = useCropMap();
  const { farm, setFarm } = useFarm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { forceDemo, lowBandwidth } = usePreferences();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // ---- Location comes from the Explore page (or the farm being edited). ----
  const paramLat = params.get('lat') != null ? Number(params.get('lat')) : NaN;
  const paramLon = params.get('lon') != null ? Number(params.get('lon')) : NaN;
  const regionParam = params.get('region') ?? farm?.regionId ?? '';
  const demoRegion = regions.data?.find((r) => r.id === regionParam) ?? null;
  const isCustomLocation = regionParam === CUSTOM_REGION_ID;
  const isDemo = params.get('demo') === '1' && !!demoRegion;
  const editingFarm = farm && farm.regionId === regionParam ? farm : null;
  const location = useMemo(() => {
    if (Number.isFinite(paramLat) && Number.isFinite(paramLon)) return { lat: paramLat, lon: paramLon };
    if (editingFarm) return { lat: editingFarm.latitude, lon: editingFarm.longitude };
    if (demoRegion) return { lat: demoRegion.latitude, lon: demoRegion.longitude };
    return null;
  }, [paramLat, paramLon, editingFarm, demoRegion]);
  const hasLocation = !!location && (isCustomLocation || !!demoRegion);
  const changeLocationHref = `/explore${isDemo ? '?demo=1' : ''}`;

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(FormSchema),
    mode: 'onTouched',
    defaultValues: {
      farmName: '',
      regionId: '',
      latitude: 0,
      longitude: 0,
      currentCrop: '',
      harvestMonth: '',
      previousCrop: '',
      previousCrop2: '',
      nextPlantingMonth: '',
      seasonsPerYear: '',
      waterAccess: '',
      waterlogging: '',
      inputLevel: '',
      soilType: '',
      soilPh: null,
      excludedCrops: [],
      priorities: { water: 2, soilHealth: 2, risk: 1, income: 1, idleLand: 0, foodSecurity: 1 },
      customCrops: [],
      saveToServer: false,
    },
  });

  // Prefill: the farm being edited, or the demo farm, otherwise empty answers.
  useEffect(() => {
    if (!hasLocation || !location || !crops.data) return;
    const catalogue = new Set(crops.data.map((c) => c.id));
    if (editingFarm && !isDemo) {
      const f = editingFarm;
      form.reset({
        farmName: f.farmName,
        regionId: f.regionId,
        latitude: location.lat,
        longitude: location.lon,
        currentCrop: f.currentCrop,
        harvestMonth: f.harvestMonth == null ? 'unknown' : String(f.harvestMonth),
        previousCrop: f.cropHistory[0] ?? 'unknown',
        previousCrop2: f.cropHistory[1] ?? 'unknown',
        nextPlantingMonth: f.nextPlantingMonth == null ? 'unsure' : String(f.nextPlantingMonth),
        seasonsPerYear: f.seasonsPerYear == null ? 'unsure' : String(f.seasonsPerYear),
        waterAccess: f.irrigation,
        waterlogging: f.waterlogging,
        inputLevel: f.inputLevel,
        soilType: f.soilType,
        soilPh: f.soilPh,
        excludedCrops: f.excludedCrops,
        priorities: Object.fromEntries(PRIORITY_KEYS.map((k) => [k, Math.round((f.priorities[k] ?? 0) * 3)])) as FormValues['priorities'],
        customCrops: [...new Set([f.currentCrop, ...f.cropHistory, ...f.excludedCrops].filter((c) => c && c !== 'fallow' && !catalogue.has(c)))],
        saveToServer: false,
      });
      return;
    }
    const d = isDemo ? demoRegion!.demoFarm : null;
    form.reset({
      ...form.getValues(),
      farmName: d?.farmName ?? '',
      regionId: isCustomLocation ? CUSTOM_REGION_ID : demoRegion!.id,
      latitude: location.lat,
      longitude: location.lon,
      currentCrop: d?.currentCrop ?? '',
      harvestMonth: d?.harvestMonth ? String(d.harvestMonth) : '',
      previousCrop: d?.cropHistory[0] ?? '',
      previousCrop2: d?.cropHistory[1] ?? '',
      nextPlantingMonth: d?.nextPlantingMonth ? String(d.nextPlantingMonth) : '',
      seasonsPerYear: d?.seasonsPerYear ? String(d.seasonsPerYear) : '',
      waterAccess: d?.irrigation ?? '',
      soilType: d?.soilType ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, location?.lat, location?.lon, regionParam, isDemo, crops.data]);

  const values = form.watch();
  const TOTAL = 5;
  const stepTitles = [t('form.steps.location'), t('form.steps.history'), t('form.steps.conditions'), t('form.steps.priorities'), t('form.steps.review')];
  const err = form.formState.errors;

  const next = async () => {
    const ok = await form.trigger(STEP_FIELDS[step] as never, { shouldFocus: true });
    if (ok) setStep((s) => Math.min(TOTAL - 1, s + 1));
  };

  const onSubmit = form.handleSubmit(async (v) => {
    setSubmitting(true);
    setSubmitError(null);
    const total = PRIORITY_KEYS.reduce((a, k) => a + v.priorities[k], 0) || 1;
    const profile: FarmProfile = {
      farmName: v.farmName,
      regionId: v.regionId,
      latitude: v.latitude,
      longitude: v.longitude,
      currentCrop: v.currentCrop,
      soilPh: v.soilPh,
      excludedCrops: v.excludedCrops,
      ...toProfileField(v),
      priorities: Object.fromEntries(PRIORITY_KEYS.map((k) => [k, Math.round((v.priorities[k] / total) * 100) / 100])) as FarmProfile['priorities'],
      constraints: farm?.regionId === v.regionId ? farm.constraints : [],
      scenario: BASELINE,
      idleMonths: null,
      planAdditions: [],
      savedFieldId: null,
      isDemo,
    };
    const msgs: string[] = [];
    try {
      // Validate the profile end-to-end through Express (and warm the Rotation Lab cache).
      const body = comparisonRequest(profile);
      try {
        await queryClient.fetchQuery({ queryKey: ['compare', body, forceDemo], queryFn: () => api.compareRotations(body) });
      } catch (e) {
        if (e instanceof ApiRequestError && e.code === 'VALIDATION_ERROR') throw e;
        // Other analysis messages (e.g. no prepared examples for this place or crop) are shown on the results page.
      }
      if (v.saveToServer) {
        try {
          const field = await api.createField({ farmName: profile.farmName, regionId: profile.regionId, field: comparisonRequest(profile).field, priorities: profile.priorities, constraints: profile.constraints });
          profile.savedFieldId = field.id;
        } catch (e) {
          msgs.push(e instanceof ApiRequestError && e.code === 'DATABASE_UNAVAILABLE' ? t('errors.DATABASE_UNAVAILABLE') : 'Your farm could not be saved on the server, but it is kept in this browser.');
        }
      }
      setFarm(profile);
      navigate('/rotations', { state: { notice: msgs.join(' ') || null } });
    } catch (e) {
      setSubmitError(e);
    } finally {
      setSubmitting(false);
    }
  });

  if (regions.isLoading || crops.isLoading) return <PageContainer><LoadingBlock /></PageContainer>;
  if (regions.isError) return <PageContainer><ErrorState error={regions.error} onRetry={() => regions.refetch()} /></PageContainer>;

  const allCropIds = [...(crops.data ?? []).map((c) => c.id), ...(values.customCrops ?? [])];
  const addCustomCrop = (id: string) => form.setValue('customCrops', [...new Set([...(values.customCrops ?? []), id])]);
  const cropOptions = allCropIds.map((id) => ({ value: id, label: cropLabel(crops.map, id) }));

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow={t('wizard.stepOf', { current: step + 1, total: TOTAL })}
        title={t('wizard.title')}
        intro={isDemo ? 'We filled in a typical farm for this demo area. Change anything you like.' : 'Every question except location has an "I do not know" option, so you can always continue.'}
      />
      {isDemo ? (
        <div className="mb-6 flex gap-2 rounded-2xl bg-gold-100 p-4 text-sm text-[#5c4510]">
          <FlaskConical className="size-5 shrink-0" aria-hidden /> This is a demo farm. Results will be clearly labelled illustrative examples.
        </div>
      ) : null}

      {/* progress */}
      <ol className="mb-6 grid grid-cols-5 gap-1.5" aria-label="Progress">
        {stepTitles.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step} aria-current={i === step ? 'step' : undefined} className="w-full cursor-pointer text-left disabled:cursor-default">
              <span className={cn('block h-2 rounded-full', i < step ? 'bg-emerald-600' : i === step ? 'bg-gold-500' : 'bg-cream-200')} />
              <span className={cn('mt-1 hidden text-xs font-semibold sm:block', i === step ? 'text-forest-900' : 'text-ink-muted')}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <form
        noValidate
        onSubmit={(e) => {
          // Enter key before the Review step moves forward instead of submitting.
          if (step < TOTAL - 1) {
            e.preventDefault();
            void next();
            return;
          }
          void onSubmit(e);
        }}
      >
        <Card className="p-5 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <h2 className="mb-5 text-2xl">{step === 4 ? t('form.review.heading') : stepTitles[step]}</h2>

              {/* ---------------- Step 1: Location ---------------- */}
              {step === 0 && (
                <div className="space-y-6">
                  <Question label={t('form.location.label')} helper={t('form.location.helper')} requiredMark>
                    {hasLocation && location ? (
                      <div className="overflow-hidden rounded-2xl border border-forest-900/10" data-testid="selected-location">
                        {!lowBandwidth ? (
                          <div className="h-48 bg-sage-100">
                            <Suspense fallback={<LoadingBlock className="h-full rounded-none border-0" label="Loading map…" rows={1} />}>
                              <LocationPreviewMap lat={location.lat} lon={location.lon} />
                            </Suspense>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 size-5 shrink-0 text-critical" aria-hidden />
                            <div>
                              <p className="font-semibold text-forest-900">
                                {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                              </p>
                              <p className="text-sm text-ink-muted">
                                {demoRegion ? t('form.location.demoArea', { region: demoRegion.name }) : t('form.location.custom')}
                              </p>
                            </div>
                          </div>
                          <Button asChild variant="secondary" size="sm">
                            <Link to={changeLocationHref} data-testid="change-location">
                              <MapPinned aria-hidden /> {t('form.location.change')}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border-2 border-dashed border-forest-900/15 p-5 text-center">
                        <p className="text-ink-muted">{t('form.location.none')}</p>
                        <Button asChild className="mt-3">
                          <Link to={changeLocationHref}>
                            <MapPinned aria-hidden /> {t('form.location.choose')}
                          </Link>
                        </Button>
                      </div>
                    )}
                    {err.regionId ? <FieldError msg={err.regionId.message} /> : null}
                  </Question>
                  <Question label={t('form.location.farmName')} htmlFor="farmName" requiredMark>
                    <input id="farmName" {...form.register('farmName')} className="h-12 w-full rounded-xl border border-forest-900/20 px-4" autoComplete="off" placeholder="e.g. Lower paddy field" />
                    {err.farmName ? <FieldError msg={err.farmName.message} /> : null}
                  </Question>
                </div>
              )}

              {/* ---------------- Step 2: Cropping history and timing ---------------- */}
              {step === 1 && (
                <div className="space-y-8">
                  <CurrentCropQuestion
                    demoRegion={demoRegion}
                    value={values.currentCrop}
                    onChange={(id) => form.setValue('currentCrop', id, { shouldValidate: true })}
                    customCrops={values.customCrops ?? []}
                    onAddCustom={addCustomCrop}
                    error={err.currentCrop?.message}
                  />
                  {values.currentCrop !== 'fallow' ? (
                    <Question label={t('form.harvestMonth.label')}>
                      <MonthPicker
                        name="harvestMonth"
                        value={values.harvestMonth}
                        onChange={(v) => form.setValue('harvestMonth', v)}
                        extras={[
                          { value: 'harvested', label: t('form.harvestMonth.harvested') },
                          { value: 'unknown', label: t('form.harvestMonth.unknown') },
                        ]}
                      />
                    </Question>
                  ) : null}
                  <Question label={t('form.previousCrop.label')} helper={t('form.previousCrop.helper')} htmlFor="previousCrop">
                    <CropSelect id="previousCrop" value={values.previousCrop} onChange={(v) => form.setValue('previousCrop', v)} options={cropOptions} />
                  </Question>
                  <Question label={t('form.previousCrop2.label')} helper={t('form.previousCrop.helper')} htmlFor="previousCrop2">
                    <CropSelect id="previousCrop2" value={values.previousCrop2} onChange={(v) => form.setValue('previousCrop2', v)} options={cropOptions} />
                  </Question>
                  <Question label={t('form.nextPlanting.label')} helper={t('form.nextPlanting.helper')} requiredMark>
                    <MonthPicker
                      name="nextPlantingMonth"
                      value={values.nextPlantingMonth}
                      onChange={(v) => form.setValue('nextPlantingMonth', v, { shouldValidate: true })}
                      extras={[{ value: 'unsure', label: t('form.nextPlanting.unsure') }]}
                    />
                    {err.nextPlantingMonth ? <FieldError msg={err.nextPlantingMonth.message} /> : null}
                  </Question>
                  <Question label={t('form.seasons.label')}>
                    <Chips
                      name="seasonsPerYear"
                      value={values.seasonsPerYear}
                      onChange={(v) => form.setValue('seasonsPerYear', v)}
                      options={[
                        { value: '1', label: t('form.seasons.one') },
                        { value: '2', label: t('form.seasons.two') },
                        { value: '3', label: t('form.seasons.three') },
                        { value: 'unsure', label: t('form.seasons.unsure') },
                      ]}
                    />
                  </Question>
                </div>
              )}

              {/* ---------------- Step 3: Farm conditions ---------------- */}
              {step === 2 && (
                <div className="space-y-8">
                  <Controller
                    control={form.control}
                    name="waterAccess"
                    render={({ field }) => (
                      <SliderQuestion
                        id="waterAccess"
                        label={t('form.water.label')}
                        requiredMark
                        value={field.value}
                        onChange={(v) => field.onChange(v)}
                        stops={(['none', 'limited', 'full'] as const).map((k) => ({ value: k, short: t(`form.slider.water.${k}`), long: t(`form.water.${k}`) }))}
                        unknownLabel={t('form.water.unknown')}
                        error={err.waterAccess?.message}
                      />
                    )}
                  />
                  <SliderQuestion
                    id="waterlogging"
                    label={t('form.waterlogging.label')}
                    value={values.waterlogging}
                    onChange={(v) => form.setValue('waterlogging', v)}
                    stops={(['drains_well', 'few_days', 'several_weeks'] as const).map((k) => ({ value: k, short: t(`form.slider.waterlogging.${k}`), long: t(`form.waterlogging.${k}`) }))}
                    unknownLabel={t('form.waterlogging.unknown')}
                  />
                  <SliderQuestion
                    id="inputLevel"
                    label={t('form.inputs.label')}
                    value={values.inputLevel}
                    onChange={(v) => form.setValue('inputLevel', v)}
                    stops={(['minimal', 'moderate', 'high'] as const).map((k) => ({ value: k, short: t(`form.slider.inputs.${k}`), long: t(`form.inputs.${k}`) }))}
                    unknownLabel={t('form.inputs.unknown')}
                  />
                  <SliderQuestion
                    id="soilType"
                    label={t('form.soil.label')}
                    value={values.soilType}
                    onChange={(v) => form.setValue('soilType', v)}
                    stops={(['sandy', 'loam', 'silt', 'clay'] as const).map((k) => ({ value: k, short: t(`form.slider.soil.${k}`), long: t(`form.soil.${k}`) }))}
                    unknownLabel={t('form.soil.unknown')}
                  />
                  <Controller
                    control={form.control}
                    name="soilPh"
                    render={({ field }) => (
                      <PhSlider
                        label={t('form.ph.label')}
                        helper={t('form.ph.helper')}
                        value={field.value ?? null}
                        onChange={(v) => field.onChange(v)}
                        error={err.soilPh?.message}
                      />
                    )}
                  />
                </div>
              )}

              {/* ---------------- Step 4: Constraints and priorities ---------------- */}
              {step === 3 && (
                <div className="space-y-8">
                  <Question label={t('form.exclude.label')} helper={t('form.exclude.helper')}>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={t('form.exclude.label')}>
                      {cropOptions.map((o) => {
                        const on = (values.excludedCrops ?? []).includes(o.value);
                        return (
                          <button
                            type="button"
                            key={o.value}
                            aria-pressed={on}
                            data-testid={`exclude-${o.value}`}
                            onClick={() =>
                              form.setValue('excludedCrops', on ? values.excludedCrops.filter((c) => c !== o.value) : [...(values.excludedCrops ?? []), o.value])
                            }
                            className={cn(
                              'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold',
                              on ? 'border-critical bg-[#fde3e1] text-critical' : 'border-forest-900/15 bg-white hover:border-sage-400',
                            )}
                          >
                            {on ? <X className="size-4" aria-hidden /> : null}
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </Question>
                  <Question label={t('form.priorities.label')} helper={t('form.priorities.helper')}>
                    <div className="space-y-3">
                      {PRIORITY_KEYS.map((k) => {
                        const Icon = PRIORITY_ICONS[k];
                        const levels = t('form.priorities.levels', { returnObjects: true }) as string[];
                        return (
                          <fieldset key={k} className="rounded-2xl border border-forest-900/10 p-4">
                            <legend className="flex items-center gap-2 px-1 font-semibold">
                              <Icon className="size-5 text-emerald-600" aria-hidden /> {t(`form.priorities.${k}`)}
                            </legend>
                            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {levels.map((label, lvl) => (
                                <label
                                  key={label}
                                  className={cn(
                                    'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center text-sm font-semibold',
                                    values.priorities?.[k] === lvl ? 'border-emerald-600 bg-emerald-100/60' : 'border-forest-900/10 hover:border-sage-400',
                                  )}
                                >
                                  <input type="radio" className="sr-only" checked={values.priorities?.[k] === lvl} onChange={() => form.setValue(`priorities.${k}`, lvl)} name={`p-${k}`} />
                                  {label}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        );
                      })}
                    </div>
                  </Question>
                </div>
              )}

              {/* ---------------- Step 5: Review ---------------- */}
              {step === 4 && <ReviewStep values={values} demoRegion={demoRegion} cropMap={crops.map} onEdit={setStep} register={form.register} />}
            </motion.div>
          </AnimatePresence>

          {submitError ? <ErrorState className="mt-4" error={submitError} /> : null}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft aria-hidden /> {t('common.back')}
            </Button>
            {step < TOTAL - 1 ? (
              <Button key="next" type="button" size="lg" onClick={next} data-testid="wizard-next">
                {t('common.continue')} <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button key="submit" type="submit" size="lg" disabled={submitting} data-testid="wizard-submit">
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden /> {t('form.review.preparing')}
                  </>
                ) : (
                  <>
                    <Check aria-hidden /> {t('form.review.button')}
                  </>
                )}
              </Button>
            )}
          </div>
          {step === TOTAL - 1 ? <p className="mt-4 text-center text-xs text-ink-muted">{t('form.review.disclaimer')}</p> : null}
        </Card>
      </form>
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
function Question({ label, helper, htmlFor, requiredMark, children }: { label: string; helper?: string; htmlFor?: string; requiredMark?: boolean; children: React.ReactNode }) {
  const Tag = htmlFor ? 'label' : 'p';
  return (
    <div>
      <Tag {...(htmlFor ? { htmlFor } : {})} className="mb-1 block font-semibold text-forest-900">
        {label}
        {requiredMark ? <span className="ml-1 text-critical" aria-label="required">*</span> : null}
      </Tag>
      {helper ? <p className="mb-2 text-sm text-ink-muted">{helper}</p> : <div className="mb-2" />}
      {children}
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return (
    <p role="alert" className="mt-1.5 text-sm font-semibold text-critical">
      {msg}
    </p>
  );
}

/** Stop i of n under the bar: first and last hug the ends, the rest are centred on their position. */
function stopStyle(i: number, n: number): React.CSSProperties {
  const pct = n > 1 ? (i / (n - 1)) * 100 : 0;
  return { left: `${pct}%`, transform: i === 0 ? 'none' : i === n - 1 ? 'translateX(-100%)' : 'translateX(-50%)' };
}

/** Ordered answers as a swipe bar: drag, tap a stop, or use the arrow keys. "I do not know" stays one tap away. */
function SliderQuestion({
  id,
  label,
  value,
  onChange,
  stops,
  unknownLabel,
  requiredMark,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  stops: { value: string; short: string; long: string }[];
  unknownLabel: string;
  requiredMark?: boolean;
  error?: string;
}) {
  const idx = stops.findIndex((s) => s.value === value);
  const answered = idx >= 0;
  const unknown = value === 'unknown';
  const shown = answered ? idx : Math.floor((stops.length - 1) / 2);
  return (
    <fieldset className="rounded-2xl border border-forest-900/10 bg-white/70 p-4 sm:p-5" data-testid={`slider-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <legend id={`${id}-label`} className="float-left max-w-md font-semibold text-forest-900">
          {label}
          {requiredMark ? <span className="ml-1 text-critical" aria-label="required">*</span> : null}
        </legend>
        <output aria-live="polite" className={cn('ml-auto text-right text-2xl font-bold leading-tight', answered ? 'text-forest-900' : 'text-ink-muted/70 text-lg')}>
          {answered ? stops[idx].short : unknown ? unknownLabel : 'Slide to choose'}
        </output>
      </div>
      <p className="clear-both mt-1 min-h-5 text-sm text-ink-muted">{answered ? stops[idx].long : unknown ? 'That is fine — the analysis will treat this as unknown.' : ' '}</p>

      <Slider
        className={cn('mt-3 transition-opacity', !answered && 'opacity-45')}
        min={0}
        max={stops.length - 1}
        step={1}
        value={[shown]}
        onValueChange={([v]) => onChange(stops[v].value)}
        onValueCommit={([v]) => onChange(stops[v].value)}
        thumbLabel={label}
        aria-labelledby={`${id}-label`}
      />
      <div className="relative h-6 text-sm">
        {stops.map((s, i) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            data-testid={`${id}-${s.value}`}
            className={cn('absolute top-0 cursor-pointer whitespace-nowrap rounded px-0.5 hover:text-emerald-700', i === idx ? 'font-bold text-emerald-700' : 'text-ink-muted')}
            style={stopStyle(i, stops.length)}
          >
            {s.short}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-pressed={unknown}
        onClick={() => onChange(unknown ? '' : 'unknown')}
        data-testid={`${id}-unknown`}
        className={cn(
          'mt-3 rounded-full border px-3 py-1 text-sm font-semibold',
          unknown ? 'border-emerald-600 bg-emerald-100 text-emerald-800' : 'border-forest-900/15 text-ink-muted hover:border-sage-400',
        )}
      >
        {unknownLabel}
      </button>
      {error ? <FieldError msg={error} /> : null}
    </fieldset>
  );
}

function phMeaning(ph: number) {
  if (ph < 5.5) return 'Strongly acidic';
  if (ph < 6.5) return 'Slightly acidic';
  if (ph <= 7.5) return 'Neutral';
  if (ph <= 8.5) return 'Slightly alkaline';
  return 'Strongly alkaline';
}

/** Soil-test pH as a swipe bar from 3.0 to 10.0. Blank (no soil test) is the default and stays one tap away. */
function PhSlider({ label, helper, value, onChange, error }: { label: string; helper: string; value: number | null; onChange: (v: number | null) => void; error?: string }) {
  const has = value != null && !Number.isNaN(value);
  const set = (v: number) => onChange(Math.round(v * 10) / 10);
  const marks = [3, 4, 5, 6, 7, 8, 9, 10];
  return (
    <fieldset className="rounded-2xl border border-forest-900/10 bg-white/70 p-4 sm:p-5" data-testid="slider-soilPh">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <legend id="soilPh-label" className="float-left max-w-md font-semibold text-forest-900">
          {label}
        </legend>
        <output aria-live="polite" className={cn('ml-auto text-right font-bold leading-tight tabular-nums', has ? 'text-2xl text-forest-900' : 'text-lg text-ink-muted/70')}>
          {has ? `pH ${value.toFixed(1)}` : 'No soil test'}
        </output>
      </div>
      <p className="clear-both mt-1 text-sm text-ink-muted">{has ? phMeaning(value) : helper}</p>

      <Slider
        className={cn('mt-3 transition-opacity', !has && 'opacity-45')}
        min={3}
        max={10}
        step={0.1}
        value={[has ? value : 6.5]}
        onValueChange={([v]) => set(v)}
        onValueCommit={([v]) => set(v)}
        thumbLabel="Soil pH"
        aria-labelledby="soilPh-label"
        data-testid="soilPh-slider"
      />
      <div className="relative h-5 text-xs text-ink-muted" aria-hidden>
        {marks.map((m, i) => (
          <span key={m} className="absolute top-0" style={stopStyle(i, marks.length)}>
            {m}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-muted" aria-hidden>
        <span>Acidic</span>
        <span>Neutral</span>
        <span>Alkaline</span>
      </div>

      {has ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          data-testid="soilPh-clear"
          className="mt-3 rounded-full border border-forest-900/15 px-3 py-1 text-sm font-semibold text-ink-muted hover:border-sage-400"
        >
          I don't have a soil test
        </button>
      ) : null}
      {error ? <FieldError msg={error} /> : null}
    </fieldset>
  );
}

function Chips({ name, value, onChange, options }: { name: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          data-testid={`${name}-${o.value}`}
          onClick={() => onChange(o.value)}
          className={cn('min-h-11 cursor-pointer rounded-full border-2 px-4 text-sm font-semibold', value === o.value ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-forest-900/15 bg-white hover:border-sage-400')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Month selector: 12 month buttons plus extra choices such as "I am not sure". */
function MonthPicker({ name, value, onChange, extras }: { name: string; value: string; onChange: (v: string) => void; extras: { value: string; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={name}>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {MONTHS.map((m) => (
          <button
            type="button"
            key={m}
            role="radio"
            aria-checked={value === String(m)}
            aria-label={monthName(m, 'en', 'long')}
            data-testid={`${name}-${m}`}
            onClick={() => onChange(String(m))}
            className={cn('min-h-11 cursor-pointer rounded-xl border-2 text-sm font-semibold', value === String(m) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-forest-900/10 bg-white hover:border-sage-400')}
          >
            {monthName(m)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {extras.map((x) => (
          <button
            type="button"
            key={x.value}
            role="radio"
            aria-checked={value === x.value}
            data-testid={`${name}-${x.value}`}
            onClick={() => onChange(x.value)}
            className={cn('min-h-11 cursor-pointer rounded-full border-2 px-4 text-sm font-semibold', value === x.value ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-forest-900/15 bg-white hover:border-sage-400')}
          >
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CropSelect({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const { t } = useTranslation();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full max-w-md rounded-xl border border-forest-900/20 bg-white px-3">
      <option value="">— Choose —</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      <option value="fallow">{t('form.currentCrop.fallow')}</option>
      <option value="unknown">{t('form.previousCrop.unknown')}</option>
    </select>
  );
}

function CurrentCropQuestion({
  demoRegion,
  value,
  onChange,
  error,
  customCrops,
  onAddCustom,
}: {
  demoRegion: Region | null;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  customCrops: string[];
  onAddCustom: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { map, data } = useCropMap();
  const [newCrop, setNewCrop] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(customCrops.length > 0);
  const demoCrop = demoRegion?.demoFarm.currentCrop;
  const ids = useMemo(() => {
    const all = (data ?? []).map((c) => c.id);
    // Show the demo region's usual crops first, then the rest of the catalogue, then the farmer's own crops.
    const first = demoRegion ? demoRegion.supportedCrops.filter((c) => all.includes(c)) : [];
    return [...new Set([...first, ...all, ...customCrops])];
  }, [data, demoRegion, customCrops]);

  const addCrop = () => {
    const name = newCrop.trim();
    const id = cropIdFromName(name);
    if (id.length < 2) {
      setAddError('Please type the crop name using letters or numbers (at least 2 characters).');
      return;
    }
    if (id === 'fallow' || id === 'unknown') {
      setAddError('Please type a crop name.');
      return;
    }
    const existing = [...map.values()].find((c) => c.id === id || c.names.en.toLowerCase() === name.toLowerCase() || c.names.en.toLowerCase().startsWith(`${name.toLowerCase()} (`));
    const finalId = existing?.id ?? id;
    if (!existing) onAddCustom(finalId);
    onChange(finalId);
    setNewCrop('');
    setAddError(null);
  };

  const card = (id: string, label: string, image: React.ReactNode, sub?: React.ReactNode) => {
    const sel = value === id;
    return (
      <button
        type="button"
        key={id}
        role="radio"
        aria-checked={sel}
        data-testid={`crop-${id}`}
        onClick={() => onChange(id)}
        className={cn('relative flex cursor-pointer flex-col items-center rounded-2xl border-2 p-3 text-center transition-colors', sel ? 'border-emerald-600 bg-emerald-100/50' : 'border-forest-900/10 hover:border-sage-400')}
      >
        {sel ? <Check className="absolute right-2 top-2 size-5 rounded-full bg-emerald-600 p-0.5 text-white" aria-hidden /> : null}
        {image}
        <span className="mt-2 font-semibold">{label}</span>
        {sub}
      </button>
    );
  };

  return (
    <div>
      <p className="mb-3 font-semibold text-forest-900">
        {t('form.currentCrop.label')}
        <span className="ml-1 text-critical" aria-label="required">*</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('form.currentCrop.label')}>
        {ids.map((id) => {
          const c = map.get(id);
          return card(
            id,
            cropLabel(map, id),
            <CropImage crop={c} cropId={id} size={80} />,
            <>
              {c?.scientificName ? <span className="text-xs italic text-ink-muted">{c.scientificName}</span> : null}
              {id === demoCrop ? <Badge variant="gold" className="mt-2">Demo examples ready</Badge> : null}
              {!c ? <Badge variant="green" className="mt-2">Your crop</Badge> : null}
            </>,
          );
        })}
        {card('fallow', t('form.currentCrop.fallow'), <CropImage cropId="fallow" size={80} />)}
        <button
          type="button"
          onClick={() => setShowOther(true)}
          aria-expanded={showOther}
          data-testid="crop-other"
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-forest-900/20 p-3 text-center hover:border-sage-400"
        >
          <span className="grid size-20 place-items-center rounded-2xl bg-cream-100 text-forest-800">
            <Plus className="size-8" aria-hidden />
          </span>
          <span className="mt-2 font-semibold">{t('form.currentCrop.other')}</span>
        </button>
      </div>

      {showOther ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-forest-900/15 p-4">
          <label htmlFor="new-crop" className="block font-semibold text-forest-900">
            Type your crop's name
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="new-crop"
              value={newCrop}
              maxLength={60}
              autoFocus
              onChange={(e) => setNewCrop(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCrop();
                }
              }}
              placeholder="e.g. Groundnut, Tea, Sweet potato"
              className="h-12 min-w-0 flex-1 rounded-xl border border-forest-900/20 px-4"
              data-testid="new-crop-input"
            />
            <Button type="button" variant="secondary" onClick={addCrop} data-testid="add-crop">
              <Plus aria-hidden /> Add crop
            </Button>
          </div>
          {addError ? <FieldError msg={addError} /> : null}
          <p className="mt-2 text-xs text-ink-muted">
            Crops you add are saved with your farm. FieldVerse has no reference information for them yet, so climate and soil information still works, and crop analysis will come with
            the AI/ML service.
          </p>
        </div>
      ) : null}
      {value && demoCrop && value !== demoCrop && value !== 'fallow' ? (
        <p className="mt-4 flex gap-2 rounded-xl bg-[#fdf0d5] p-3 text-sm text-[#5c4510]">
          <Info className="size-5 shrink-0" aria-hidden /> Prepared demo examples here are for {cropLabel(map, demoCrop)} fields. For {cropLabel(map, value)}, you will still see your climate and
          soil information; crop-rotation results will come with the AI/ML analysis service.
        </p>
      ) : null}
      {error ? <FieldError msg={error} /> : null}
    </div>
  );
}

function ReviewStep({
  values,
  demoRegion,
  cropMap,
  onEdit,
  register,
}: {
  values: FormValues;
  demoRegion: Region | null;
  cropMap: Map<string, any>;
  onEdit: (s: number) => void;
  register: ReturnType<typeof useForm<FormValues, unknown, FormOutput>>['register'];
}) {
  const { t } = useTranslation();
  const asProfile = {
    currentCrop: values.currentCrop,
    soilPh: values.soilPh != null && !Number.isNaN(values.soilPh) ? values.soilPh : null,
    excludedCrops: values.excludedCrops ?? [],
    ...toProfileField(values as FormOutput),
  };
  const answers = describeAnswers(asProfile, t, cropMap);
  const stepOf: Record<string, number> = { current_crop: 1, harvest_month: 1, previous_crop: 1, previous_crop_2: 1, next_planting_month: 1, seasons_per_year: 1, excluded_crops: 3 };
  const unknownCount = answers.filter((a) => a.unknown).length;
  const levels = t('form.priorities.levels', { returnObjects: true }) as string[];
  return (
    <div>
      <p className="text-ink-muted">{t('form.review.intro')}</p>
      <div className="mt-4 flex gap-2 rounded-xl bg-sky-100 p-3 text-sm text-[#1c4f7a]" data-testid="review-notice">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p>{t('form.review.notice')}</p>
          {unknownCount ? <p className="mt-1 font-semibold">{t('form.review.unknownCount', { count: unknownCount })}</p> : null}
        </div>
      </div>
      <dl className="mt-4 divide-y divide-forest-900/10">
        <ReviewRow label={t('form.location.label')} value={`${values.latitude?.toFixed(4)}, ${values.longitude?.toFixed(4)}${demoRegion ? ` · ${demoRegion.name}` : ''}`} onEdit={() => onEdit(0)} />
        <ReviewRow label={t('form.location.farmName')} value={values.farmName} onEdit={() => onEdit(0)} />
        {answers.map((a) => (
          <ReviewRow key={a.key} label={a.label} value={a.value} unknown={a.unknown} onEdit={() => onEdit(stepOf[a.key] ?? 2)} />
        ))}
        <ReviewRow
          label={t('form.priorities.label')}
          value={PRIORITY_KEYS.filter((k) => (values.priorities?.[k] ?? 0) > 0)
            .map((k) => `${t(`form.priorities.${k}`)} (${levels[values.priorities![k]]})`)
            .join(' · ') || 'All goals: not important'}
          onEdit={() => onEdit(3)}
        />
      </dl>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-cream-100 p-4 text-sm">
        <input type="checkbox" className="mt-0.5 size-5 accent-emerald-600" {...register('saveToServer')} />
        <span>
          <strong>Also save this farm to my account</strong> so I can reopen it later. Saved farms are private to your account.
        </span>
      </label>
    </div>
  );
}

function ReviewRow({ label, value, onEdit, unknown }: { label: string; value: string; onEdit: () => void; unknown?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <dt className="text-sm text-ink-muted">{label}</dt>
        <dd className={cn('font-semibold', unknown && 'text-[#5c4510]')}>
          {value}
          {unknown ? <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold">estimated later</span> : null}
        </dd>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`${t('common.edit')}: ${label}`}>
        <Pencil aria-hidden /> {t('common.edit')}
      </Button>
    </div>
  );
}

// Re-exported for tests/other pages that may want the same helper.
export { regionForLocation };
