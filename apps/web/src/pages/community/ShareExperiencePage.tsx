import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Eye, ImageOff, Loader2, LogIn, MapPin, PenLine, Search, ShieldCheck } from 'lucide-react';
import {
  COMMUNITY_CATEGORY_LABELS,
  CommunityCategorySchema,
  detectPersonalInfo,
  type AdminArea,
  type CommunityCategory,
  type MyExperience,
  type PublicExperience,
  type VisibilityLevel,
} from '@fieldverse/contracts';
import { PageContainer, PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { CropImage, cropLabel } from '@/components/CropVisual';
import { useCropMap, useSession } from '@/hooks/queries';
import { useFarm } from '@/contexts/FarmContext';
import { api, communityApi, ApiRequestError } from '@/services/api';
import { cn, formatDate } from '@/lib/utils';
import { areaLabel, useFarmCommunityArea } from '@/features/community/CommunityAreaContext';
import { CATEGORY_ICONS, ExperienceVisual, HONESTY_LINE, VerificationNote, experienceHeading } from '@/features/community/CommunityParts';

const YEAR = new Date().getFullYear();
const FormSchema = z.object({
  cropId: z.string(),
  category: z.string().min(1, 'Please choose what this is about.'),
  title: z.string().max(100, 'Please keep the title under 100 characters'),
  description: z.string().trim().min(30, 'Please write at least 30 characters so other farmers can learn from it.').max(2000, 'Please keep this under 2000 characters'),
  lessonsLearned: z.string().max(1000, 'Please keep this under 1000 characters'),
  season: z.string().max(40, 'Please keep this under 40 characters'),
  approximateYear: z.string().refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1950 && Number(v) <= YEAR + 1), `Use a year between 1950 and ${YEAR + 1}`),
  irrigationMethod: z.string(),
  soilNotes: z.string().max(300, 'Please keep this under 300 characters'),
  weatherNotes: z.string().max(300, 'Please keep this under 300 characters'),
  visibilityLevel: z.enum(['admin2', 'admin1', 'country']),
});
type FormValues = z.infer<typeof FormSchema>;
const EMPTY: FormValues = { cropId: '', category: '', title: '', description: '', lessonsLearned: '', season: '', approximateYear: '', irrigationMethod: '', soilNotes: '', weatherNotes: '', visibilityLevel: 'admin2' };
const DRAFT_KEY = 'fv.community.draft.v1';

const IRRIGATION = [
  { value: 'rainfed', label: 'Rain only' },
  { value: 'tank_canal', label: 'Tank or canal' },
  { value: 'well_pump', label: 'Well or pump' },
  { value: 'drip_sprinkler', label: 'Drip or sprinkler' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'I do not know' },
];
const WARNING_LABEL: Record<string, string> = {
  email: 'an email address',
  phone: 'a phone number',
  url: 'a web link',
  address: 'an address or house number',
  coordinates: 'map coordinates',
  social_handle: 'a social media name',
};

type Located = { area: AdminArea; areaToken: string | null; levelLabels: { admin1: string; admin2: string } };

export default function ShareExperiencePage() {
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const session = useSession();
  const authed = !!session.data?.authenticated;
  const { farm } = useFarm();
  const farmArea = useFarmCommunityArea();
  const { data: crops, map } = useCropMap();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ['community', 'mine'], queryFn: communityApi.mine, enabled: !!editId && authed });
  const editing: MyExperience | undefined = mine.data?.find((e) => e.id === editId);

  const [located, setLocated] = useState<Located | null>(null);
  const [mode, setMode] = useState<'form' | 'preview' | 'done'>('form');
  const [ack, setAck] = useState(false);
  const [published, setPublished] = useState<MyExperience | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: EMPTY, mode: 'onTouched' });
  const v = form.watch();

  // Restore a guest's temporary draft (this browser tab only) — or the post being edited.
  useEffect(() => {
    if (editId) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) form.reset({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (editId) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, [v, editId]);
  useEffect(() => {
    if (!editing) return;
    form.reset({
      cropId: editing.cropId ?? '',
      category: editing.category,
      title: editing.title ?? '',
      description: editing.description,
      lessonsLearned: editing.lessonsLearned ?? '',
      season: editing.season ?? '',
      approximateYear: editing.approximateYear ? String(editing.approximateYear) : '',
      irrigationMethod: editing.irrigationMethod ?? '',
      soilNotes: editing.soilNotes ?? '',
      weatherNotes: editing.weatherNotes ?? '',
      visibilityLevel: editing.publicLocation.visibilityLevel,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // Location: the farm's area by default (coarse, resolved by the server).
  const current: Located | null = useMemo(
    () =>
      located ??
      (editing
        ? { area: editing.publicLocation, areaToken: null, levelLabels: farmArea.data?.levelLabels ?? { admin1: 'Province', admin2: 'District' } }
        : farmArea.data
          ? { area: farmArea.data.area, areaToken: farmArea.data.areaToken, levelLabels: farmArea.data.levelLabels }
          : null),
    [located, editing, farmArea.data],
  );
  useEffect(() => {
    if (!current || editing) return;
    if (v.visibilityLevel === 'admin2' && !current.area.admin2Code) form.setValue('visibilityLevel', current.area.admin1Code ? 'admin1' : 'country');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.area.admin2Code]);

  const levelOptions = useMemo(() => {
    if (!current) return [];
    const a = current.area;
    const order: VisibilityLevel[] = ['admin2', 'admin1', 'country'];
    const minIndex = editing && !located ? order.indexOf(editing.publicLocation.visibilityLevel) : 0; // can only broaden an existing post
    return [
      a.admin2Code ? { level: 'admin2' as const, label: `${current.levelLabels.admin2}: ${areaLabel(a)}` } : null,
      a.admin1Code ? { level: 'admin1' as const, label: `${current.levelLabels.admin1}: ${areaLabel({ ...a, admin2Name: null })}` } : null,
      { level: 'country' as const, label: `Country only: ${a.countryName}` },
    ].filter((o): o is { level: VisibilityLevel; label: string } => !!o && order.indexOf(o.level) >= minIndex);
  }, [current, editing, located]);

  const preview: PublicExperience | null = current
    ? {
        id: 'preview',
        publicLocation: {
          countryCode: current.area.countryCode,
          countryName: current.area.countryName,
          admin1Code: v.visibilityLevel === 'country' ? null : current.area.admin1Code,
          admin1Name: v.visibilityLevel === 'country' ? null : current.area.admin1Name,
          admin2Code: v.visibilityLevel === 'admin2' ? current.area.admin2Code : null,
          admin2Name: v.visibilityLevel === 'admin2' ? current.area.admin2Name : null,
          visibilityLevel: v.visibilityLevel,
        },
        cropId: v.cropId || null,
        category: (v.category || 'other') as CommunityCategory,
        title: v.title.trim() || null,
        description: v.description.trim(),
        lessonsLearned: v.lessonsLearned.trim() || null,
        season: v.season.trim() || null,
        approximateYear: v.approximateYear ? Number(v.approximateYear) : null,
        irrigationMethod: (v.irrigationMethod || null) as PublicExperience['irrigationMethod'],
        soilNotes: v.soilNotes.trim() || null,
        weatherNotes: v.weatherNotes.trim() || null,
        helpfulCount: 0,
        postedOn: new Date().toISOString().slice(0, 10),
        edited: !!editing,
        verification: 'farmer_reported',
        isDemo: false,
        viewerMarkedHelpful: false,
        relevance: null,
      }
    : null;
  const warnings = useMemo(
    () => [v.title, v.description, v.lessonsLearned, v.season, v.soilNotes, v.weatherNotes].flatMap((t) => (t ? detectPersonalInfo(t) : [])),
    [v.title, v.description, v.lessonsLearned, v.season, v.soilNotes, v.weatherNotes],
  );

  const submit = useMutation({
    mutationFn: async () => {
      const p = preview!;
      const body = {
        cropId: p.cropId,
        category: p.category,
        title: p.title,
        description: p.description,
        lessonsLearned: p.lessonsLearned,
        season: p.season,
        approximateYear: p.approximateYear,
        irrigationMethod: p.irrigationMethod,
        soilNotes: p.soilNotes,
        weatherNotes: p.weatherNotes,
        visibilityLevel: v.visibilityLevel,
        acknowledgePrivacyWarnings: ack,
      };
      if (editing) {
        const withArea = located?.areaToken ? { area: located.area, areaToken: located.areaToken } : {};
        return communityApi.update(editing.id, { ...body, ...withArea });
      }
      try {
        return await communityApi.create({ ...body, area: current!.area, areaToken: current!.areaToken! });
      } catch (e) {
        // The server's confirmation of the farm's area has expired (e.g. the server restarted):
        // confirm the same farm location again and try once more, instead of asking the farmer.
        const expired = e instanceof ApiRequestError && /could not be confirmed/i.test(e.message);
        if (!expired || located || !farm) throw e;
        const fresh = await communityApi.resolve(farm.latitude, farm.longitude);
        qc.setQueryData(['communityArea', Math.round(farm.latitude * 100) / 100, Math.round(farm.longitude * 100) / 100], fresh);
        return communityApi.create({ ...body, area: fresh.area, areaToken: fresh.areaToken });
      }
    },
    onSuccess: (e) => {
      setPublished(e);
      setMode('done');
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
  });

  if (editId && (session.isLoading || mine.isLoading)) return <PageContainer><LoadingBlock /></PageContainer>;
  if (editId && !editing && mine.isSuccess) return <PageContainer><ErrorState error={new ApiRequestError(404, 'NOT_FOUND', 'This experience was not found among your experiences.')} /></PageContainer>;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader eyebrow="FieldVerse Community" title={editing ? 'Edit my experience' : 'Share my experience'} intro="Tell other farmers what happened on your farm and what you learned. Your name and account will not be shown." />

      <AnimatePresence mode="wait">
        {mode === 'done' && published ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="p-8 text-center" data-testid="share-done">
              <CheckCircle2 className="mx-auto size-14 text-good" aria-hidden />
              <h2 className="mt-3 text-2xl">Thank you for sharing!</h2>
              <p className="mt-2 text-ink-muted">
                {published.moderationStatus === 'pending'
                  ? 'Your experience will appear in the community after a moderator reviews it. You can see its status in My experiences.'
                  : 'Your experience is now visible to other farmers.'}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link to="/community/my-experiences">My experiences</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/community">Back to the community</Link>
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : mode === 'preview' && preview ? (
          <motion.div key="preview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
            <h2 className="text-2xl">This is exactly what other farmers will see</h2>
            <PublicPreview e={preview} cropMap={map} />
            <Card className="space-y-2 p-5 text-sm" data-testid="privacy-check">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-5 text-emerald-600" aria-hidden /> Privacy check
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Your name and account details will not appear. Other farmers can see your selected general location and the experience you share.</li>
                <li>
                  Public location: <strong>{areaLabel(preview.publicLocation)}</strong>. Your exact field location is never shared.
                </li>
                <li>People could still recognise you from what you write. Please do not include names, phone numbers, exact addresses or other identifying details.</li>
                <li className="flex items-start gap-1.5">
                  <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden /> Photos are not supported yet, so no images will be published.
                </li>
              </ul>
              {warnings.length ? (
                <div className="mt-3 rounded-xl border border-critical/30 bg-[#fff6f5] p-3" role="alert">
                  <p className="flex items-center gap-2 font-semibold text-critical">
                    <AlertTriangle className="size-4" aria-hidden /> Your text may contain {[...new Set(warnings.map((w) => WARNING_LABEL[w.type]))].join(', ')}.
                  </p>
                  <p className="mt-1 text-ink-muted">This automatic check can miss things or be wrong. Please go back and remove personal details, or confirm below.</p>
                  <label className="mt-2 flex cursor-pointer items-start gap-2">
                    <input type="checkbox" className="mt-0.5 size-5 accent-emerald-600" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="ack-warnings" />
                    <span>I checked my text and I am happy to publish it.</span>
                  </label>
                </div>
              ) : (
                <p className="text-good">No obvious personal details were found. (This automatic check is not perfect.)</p>
              )}
            </Card>
            {submit.isError ? <ErrorState error={submit.error} /> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => setMode('form')}>
                <ArrowLeft aria-hidden /> Back to edit
              </Button>
              {authed ? (
                <Button size="lg" onClick={() => submit.mutate()} disabled={submit.isPending || (warnings.length > 0 && !ack) || (!editing && !current?.areaToken)} data-testid="publish">
                  {submit.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} {editing ? 'Save changes' : 'Publish anonymously'}
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link to="/login" data-testid="login-to-publish">
                    <LogIn aria-hidden /> Log in to publish
                  </Link>
                </Button>
              )}
            </div>
            {!authed ? <p className="text-right text-xs text-ink-muted">Your draft is kept in this browser tab while you log in.</p> : null}
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            noValidate
            className="space-y-6"
            onSubmit={form.handleSubmit(() => {
              setAck(false);
              setMode('preview');
            })}
          >
            {/* 1. Where */}
            <Card className="space-y-3 p-5 sm:p-6">
              <h2 className="text-xl">1. Where did this happen?</h2>
              <LocationChooser current={current} loading={!!farm && farmArea.isLoading} hasFarm={!!farm} onLocated={setLocated} />
              {current ? (
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">How much of the location should other farmers see?</legend>
                  <div className="grid gap-2">
                    {levelOptions.map((o) => (
                      <label key={o.level} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2', v.visibilityLevel === o.level ? 'border-emerald-600 bg-emerald-100/50' : 'border-forest-900/10')}>
                        <input type="radio" className="size-5 accent-emerald-600" {...form.register('visibilityLevel')} value={o.level} data-testid={`visibility-${o.level}`} />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">Choose a broader area if your district has few farmers and people might recognise you. Exact field locations are never shared.</p>
                </fieldset>
              ) : null}
            </Card>

            {/* 2. Crop or topic */}
            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="text-xl">2. Which crop or topic is this about?</h2>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Topic</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CommunityCategorySchema.options.map((c) => {
                    const Icon = CATEGORY_ICONS[c];
                    return (
                      <label key={c} className={cn('flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold', v.category === c ? 'border-emerald-600 bg-emerald-100/50' : 'border-forest-900/10 hover:border-sage-400')}>
                        <input type="radio" className="sr-only" {...form.register('category')} value={c} data-testid={`category-${c}`} />
                        <Icon className="size-5 shrink-0 text-emerald-700" aria-hidden /> {COMMUNITY_CATEGORY_LABELS[c]}
                      </label>
                    );
                  })}
                </div>
                {form.formState.errors.category ? <p role="alert" className="mt-1 text-sm font-semibold text-critical">{form.formState.errors.category.message}</p> : null}
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Crop (optional)</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Crop">
                  <button type="button" role="radio" aria-checked={!v.cropId} onClick={() => form.setValue('cropId', '')} className={cn('min-h-12 cursor-pointer rounded-xl border-2 px-3 text-sm font-semibold', !v.cropId ? 'border-emerald-600 bg-emerald-100/50' : 'border-forest-900/10')}>
                    No specific crop
                  </button>
                  {[...(crops ?? []).map((c) => c.id), ...(farm && !map.get(farm.currentCrop) && farm.currentCrop !== 'fallow' ? [farm.currentCrop] : [])].map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={v.cropId === id}
                      data-testid={`share-crop-${id}`}
                      onClick={() => form.setValue('cropId', id)}
                      className={cn('inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 py-1 pl-1 pr-3 text-sm font-semibold', v.cropId === id ? 'border-emerald-600 bg-emerald-100/50' : 'border-forest-900/10 hover:border-sage-400')}
                    >
                      <CropImage crop={map.get(id)} cropId={id} size={36} className="rounded-lg" />
                      {cropLabel(map, id).replace(/\s*\(.*\)/, '')}
                    </button>
                  ))}
                </div>
              </fieldset>
            </Card>

            {/* 3. What happened */}
            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="text-xl">3. What happened?</h2>
              <TextArea label="Tell other farmers about your experience." id="description" required max={2000} rows={6} value={v.description} error={form.formState.errors.description?.message} register={form.register('description')} />
              <TextArea label="What did you learn? What would you suggest other farmers check?" id="lessonsLearned" max={1000} rows={3} value={v.lessonsLearned} error={form.formState.errors.lessonsLearned?.message} register={form.register('lessonsLearned')} />
              <label className="block text-sm font-semibold">
                Short title (optional)
                <input {...form.register('title')} maxLength={100} className="mt-1 h-11 w-full rounded-xl border border-forest-900/20 px-3 font-normal" placeholder="e.g. Mung bean after Maha rice" />
              </label>
            </Card>

            {/* Optional details */}
            <Card className="p-5 sm:p-6">
              <details>
                <summary className="cursor-pointer text-lg font-semibold text-forest-900">More details (optional)</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold">
                    Season
                    <input {...form.register('season')} maxLength={40} className="mt-1 h-11 w-full rounded-xl border border-forest-900/20 px-3 font-normal" placeholder="e.g. Yala, long rains" />
                  </label>
                  <label className="block text-sm font-semibold">
                    Approximate year
                    <input {...form.register('approximateYear')} inputMode="numeric" maxLength={4} className="mt-1 h-11 w-full rounded-xl border border-forest-900/20 px-3 font-normal" placeholder={String(YEAR)} />
                    {form.formState.errors.approximateYear ? <span role="alert" className="text-sm text-critical">{form.formState.errors.approximateYear.message}</span> : null}
                  </label>
                  <label className="block text-sm font-semibold">
                    Irrigation
                    <select {...form.register('irrigationMethod')} className="mt-1 h-11 w-full rounded-xl border border-forest-900/20 bg-white px-3 font-normal">
                      <option value="">—</option>
                      {IRRIGATION.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div />
                  <TextArea label="Soil notes" id="soilNotes" max={300} rows={2} value={v.soilNotes} error={form.formState.errors.soilNotes?.message} register={form.register('soilNotes')} />
                  <TextArea label="Weather notes" id="weatherNotes" max={300} rows={2} value={v.weatherNotes} error={form.formState.errors.weatherNotes?.message} register={form.register('weatherNotes')} />
                </div>
              </details>
            </Card>

            <p className="flex gap-2 rounded-xl bg-sky-100 p-3 text-sm text-[#1c4f7a]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> Your name and account details will not appear. Please do not write names, phone numbers or exact addresses.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => navigate(editing ? '/community/my-experiences' : '/community')}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={!current} data-testid="preview-experience">
                <Eye aria-hidden /> Preview before publishing
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}

function TextArea({ label, id, max, rows, value, error, register, required }: { label: string; id: string; max: number; rows: number; value: string; error?: string; register: ReturnType<ReturnType<typeof useForm<FormValues>>['register']>; required?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {required ? <span className="ml-1 text-critical" aria-label="required">*</span> : null}
      </label>
      <textarea id={id} rows={rows} maxLength={max} {...register} className="mt-1 w-full rounded-xl border border-forest-900/20 p-3" aria-invalid={!!error} data-testid={`field-${id}`} />
      <div className="flex justify-between text-xs">
        <span role={error ? 'alert' : undefined} className="font-semibold text-critical">
          {error}
        </span>
        <span className="tabular-nums text-ink-muted">
          {value.length} / {max}
        </span>
      </div>
    </div>
  );
}

function LocationChooser({ current, loading, hasFarm, onLocated }: { current: Located | null; loading: boolean; hasFarm: boolean; onLocated: (l: Located) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ name: string; label: string; latitude: number; longitude: number }[]>([]);
  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResults((await api.geocode(q.trim())).results);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  };
  const pick = async (lat: number, lon: number) => {
    setBusy(true);
    setError(null);
    try {
      const r = await communityApi.resolve(lat, lon);
      onLocated({ area: r.area, areaToken: r.areaToken, levelLabels: r.levelLabels });
      setOpen(false);
      setResults([]);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not find the district for this place.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {loading ? (
        <p className="flex items-center gap-2 text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Finding the district of your field…
        </p>
      ) : current ? (
        <p className="flex items-center gap-2 font-semibold" data-testid="share-location">
          <MapPin className="size-5 text-emerald-600" aria-hidden /> {areaLabel(current.area)}
        </p>
      ) : (
        <p className="text-ink-muted">{hasFarm ? 'We could not find the district of your farm.' : 'Choose the area where this happened.'}</p>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        <PenLine aria-hidden /> {current ? 'Choose a different place' : 'Choose the place'}
      </Button>
      {open ? (
        <div className="space-y-2 rounded-xl border border-forest-900/10 p-3">
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void search();
                }
              }}
              aria-label="Search a village or town"
              placeholder="Search a village or town"
              className="h-11 min-w-0 flex-1 rounded-lg border border-forest-900/20 px-3"
            />
            <Button type="button" variant="secondary" onClick={() => void search()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Search
            </Button>
          </div>
          {results.map((r, i) => (
            <button key={i} type="button" className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-sage-100" onClick={() => void pick(r.latitude, r.longitude)}>
              <span className="block font-semibold">{r.name}</span>
              <span className="block text-xs text-ink-muted">{r.label}</span>
            </button>
          ))}
          {error ? (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          ) : null}
          <p className="text-xs text-ink-muted">Only the district, province and country are used — not the exact place you search for.</p>
        </div>
      ) : null}
    </div>
  );
}

function PublicPreview({ e, cropMap }: { e: PublicExperience; cropMap: Map<string, any> }) {
  return (
    <Card className="space-y-3 p-5 sm:p-6" data-testid="public-preview">
      <div className="flex items-start gap-3">
        <ExperienceVisual e={e} size={72} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Farmer experience</p>
          <h3 className="text-xl">{experienceHeading(e, cropMap)}</h3>
          <p className="flex items-center gap-1 text-sm text-ink-muted">
            <MapPin className="size-4 text-emerald-600" aria-hidden /> {areaLabel(e.publicLocation)} · Shared {formatDate(e.postedOn)}
          </p>
        </div>
      </div>
      <p className="whitespace-pre-line">{e.description}</p>
      {e.lessonsLearned ? (
        <div className="rounded-xl bg-sage-100 p-3">
          <p className="text-sm font-semibold">What I learned</p>
          <p className="whitespace-pre-line text-sm">{e.lessonsLearned}</p>
        </div>
      ) : null}
      <VerificationNote />
      <p className="text-xs text-ink-muted">{HONESTY_LINE}</p>
    </Card>
  );
}
