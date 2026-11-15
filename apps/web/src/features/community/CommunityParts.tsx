import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  CalendarDays,
  CloudRain,
  Droplets,
  Flag,
  Globe2,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Repeat,
  Search,
  ShieldCheck,
  Sprout,
  Sun,
  ThumbsUp,
  Tractor,
  Users,
  Wheat,
} from 'lucide-react';
import {
  COMMUNITY_CATEGORY_LABELS,
  REPORT_REASON_LABELS,
  ReportReasonSchema,
  type CommunityCategory,
  type PublicExperience,
} from '@fieldverse/contracts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/primitives';
import { CropImage, cropLabel } from '@/components/CropVisual';
import { ErrorState } from '@/components/StatusStates';
import { useCropMap, useSession } from '@/hooks/queries';
import { api, communityApi, ApiRequestError } from '@/services/api';
import { cn, formatDate } from '@/lib/utils';
import { areaLabel, useCommunityArea } from './CommunityAreaContext';

export const CATEGORY_ICONS: Record<CommunityCategory, typeof Sprout> = {
  crop_cultivation: Sprout,
  crop_rotation: Repeat,
  irrigation: Droplets,
  soil_improvement: Layers,
  pests_diseases: Bug,
  flooding: CloudRain,
  drought: Sun,
  harvesting: Wheat,
  seeds_planting: Tractor,
  other: Users,
};

export const HONESTY_LINE = 'Farmer-reported experience. Conditions may differ on your farm.';

/** Heading for a post: its own title, or "<crop> · <topic>". */
export function experienceHeading(e: Pick<PublicExperience, 'title' | 'cropId' | 'category'>, map: Map<string, any>) {
  if (e.title) return e.title;
  const topic = COMMUNITY_CATEGORY_LABELS[e.category];
  return e.cropId ? `${cropLabel(map, e.cropId).replace(/\s*\(.*\)/, '')} · ${topic}` : topic;
}

export function ExperienceVisual({ e, size = 64 }: { e: Pick<PublicExperience, 'cropId' | 'category'>; size?: number }) {
  const { map } = useCropMap();
  if (e.cropId) return <CropImage crop={map.get(e.cropId)} cropId={e.cropId} size={size} />;
  const Icon = CATEGORY_ICONS[e.category];
  return (
    <span className="grid shrink-0 place-items-center rounded-2xl bg-sage-100 text-emerald-700" style={{ width: size, height: size }} aria-hidden>
      <Icon className="size-1/2" />
    </span>
  );
}

export function VerificationNote({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-xs font-semibold text-[#6d4f12]', className)}>
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> Farmer-reported — not independently verified
    </p>
  );
}

/* ------------------------------ Card ------------------------------ */
export function CommunityExperienceCard({ e, index = 0 }: { e: PublicExperience; index?: number }) {
  const { map } = useCropMap();
  const heading = experienceHeading(e, map);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.04 }}
      className="flex flex-col gap-3 rounded-3xl border border-forest-900/10 bg-white p-5 shadow-[var(--shadow-card)]"
      aria-labelledby={`exp-${e.id}`}
      data-testid="experience-card"
    >
      <div className="flex items-start gap-3">
        <ExperienceVisual e={e} />
        <div className="min-w-0 flex-1">
          <h3 id={`exp-${e.id}`} className="text-lg leading-snug">
            {heading}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
            <MapPin className="size-4 shrink-0 text-emerald-600" aria-hidden /> {areaLabel(e.publicLocation)}
          </p>
          <p className="flex items-center gap-1 text-xs text-ink-muted">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden /> Shared {formatDate(e.postedOn)}
            {e.edited ? ' · edited' : ''}
          </p>
        </div>
      </div>
      {e.relevance ? (
        <Badge variant={e.relevance.level === 1 ? 'green' : e.relevance.level === 4 ? 'outline' : 'sky'} className="self-start">
          {e.relevance.level === 4 ? <Globe2 aria-hidden /> : <MapPin aria-hidden />} {e.relevance.reason}
        </Badge>
      ) : null}
      {e.isDemo ? <Badge variant="gold" className="self-start">Demonstration example — not a real farmer</Badge> : null}
      <p className="line-clamp-4 whitespace-pre-line text-[0.95rem]">{e.description}</p>
      <VerificationNote />
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-forest-900/5 pt-3">
        <Button asChild size="sm" variant="secondary">
          <Link to={`/community/experiences/${e.id}`} data-testid="read-experience">
            Read experience <ArrowRight aria-hidden />
          </Link>
        </Button>
        <HelpfulButton e={e} />
        <ReportButton experienceId={e.id} />
      </div>
    </motion.article>
  );
}

/* ------------------------------ Helpful ------------------------------ */
export function HelpfulButton({ e }: { e: Pick<PublicExperience, 'id' | 'helpfulCount' | 'viewerMarkedHelpful'> }) {
  const session = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [state, setState] = useState({ count: e.helpfulCount, on: e.viewerMarkedHelpful });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (on: boolean) => communityApi.helpful(e.id, on),
    onSuccess: (r) => {
      setState({ count: r.helpfulCount, on: r.viewerMarkedHelpful });
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : 'Could not save. Please try again.'),
  });
  const authed = !!session.data?.authenticated;
  return (
    <span className="inline-flex items-center gap-2">
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={() => (authed ? m.mutate(!state.on) : navigate('/login'))}
        aria-pressed={state.on}
        disabled={m.isPending}
        data-testid="helpful-button"
        className={cn(
          'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold transition-colors',
          state.on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-forest-900/15 bg-white text-forest-900 hover:border-sage-400',
        )}
        title={authed ? undefined : 'Log in to mark experiences as helpful'}
      >
        {m.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ThumbsUp className="size-4" aria-hidden />}
        Helpful
        <span className="tabular-nums" aria-label={`${state.count} farmers found this helpful`}>
          {state.count}
        </span>
      </motion.button>
      {error ? (
        <span role="alert" className="text-xs text-critical">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------ Report ------------------------------ */
export function ReportButton({ experienceId }: { experienceId: string }) {
  const session = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof ReportReasonSchema.options)[number] | ''>('');
  const [details, setDetails] = useState('');
  const m = useMutation({ mutationFn: () => communityApi.report(experienceId, { reason: reason as never, details: details || null }) });
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => (session.data?.authenticated ? setOpen(true) : navigate('/login'))}
        data-testid="report-button"
      >
        <Flag aria-hidden /> Report
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { m.reset(); setReason(''); setDetails(''); } }}>
        <DialogContent title="Report this experience" description="Moderators review every report. The person who shared it will not see who reported it.">
          {m.isSuccess ? (
            <div className="space-y-3" role="status">
              <p className="flex items-center gap-2 font-semibold text-good">
                <ShieldCheck className="size-5" aria-hidden /> Thank you. A moderator will review it.
              </p>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (reason) m.mutate();
              }}
            >
              <fieldset>
                <legend className="mb-2 font-semibold">What is the problem?</legend>
                <div className="grid gap-2">
                  {ReportReasonSchema.options.map((r) => (
                    <label key={r} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-2 px-3', reason === r ? 'border-emerald-600 bg-emerald-100/50' : 'border-forest-900/10')}>
                      <input type="radio" name="reason" className="size-5 accent-emerald-600" checked={reason === r} onChange={() => setReason(r)} />
                      {REPORT_REASON_LABELS[r]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-semibold">
                More details (optional)
                <textarea value={details} onChange={(ev) => setDetails(ev.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border border-forest-900/20 p-3 font-normal" />
              </label>
              {m.isError ? <ErrorState error={m.error} /> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!reason || m.isPending} data-testid="submit-report">
                  {m.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Flag aria-hidden />} Send report
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------ Location banner & picker ------------------------------ */
export function CommunityLocationBanner() {
  const { area, source, isLoading, hasFarm } = useCommunityArea();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-forest-900 p-4 text-cream-50 sm:p-5" data-testid="community-location">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-6 shrink-0 text-gold-500" aria-hidden />
        <div>
          {isLoading ? (
            <p className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Finding the district of your field…
            </p>
          ) : area ? (
            <>
              <p className="text-lg font-semibold">Showing farming experiences from {areaLabel(area)}.</p>
              <p className="text-sm text-cream-50/75">{source === 'farm' ? 'Based on your farm location (district level only).' : 'An area you chose.'}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">Choose your area to see experiences from farmers near you.</p>
              <p className="text-sm text-cream-50/75">{hasFarm ? 'We could not work out the district of your farm.' : 'We will not guess your location.'}</p>
            </>
          )}
        </div>
      </div>
      <Button variant="gold" onClick={() => setOpen(true)} data-testid="change-community-location">
        <MapPin aria-hidden /> {area ? 'Change location' : 'Choose location'}
      </Button>
      <ChangeAreaDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function ChangeAreaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { hasFarm, source, setManualArea, resetToFarmArea } = useCommunityArea();
  const areas = useQuery({ queryKey: ['community', 'areas'], queryFn: communityApi.areas, enabled: open });
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ name: string; label: string; latitude: number; longitude: number }[]>([]);

  const search = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setResults((await api.geocode(q.trim())).results);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };
  const choosePlace = async (lat: number, lon: number) => {
    setSearching(true);
    setError(null);
    try {
      const r = await communityApi.resolve(lat, lon);
      setManualArea(r.area, r.levelLabels);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not find the district for this place.');
    } finally {
      setSearching(false);
    }
  };

  // Group areas with experiences by country.
  const byCountry = new Map<string, NonNullable<typeof areas.data>>();
  for (const a of areas.data ?? []) byCountry.set(a.countryName, [...(byCountry.get(a.countryName) ?? []), a]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Choose a community area" description="Experiences are matched by district, province and country — never by exact location.">
        <div className="space-y-5">
          {hasFarm ? (
            <Button
              variant={source === 'farm' ? 'secondary' : 'primary'}
              className="w-full"
              onClick={() => {
                resetToFarmArea();
                onOpenChange(false);
              }}
              data-testid="use-farm-area"
            >
              <LocateFixed aria-hidden /> Use my farm's area
            </Button>
          ) : null}
          <form
            className="space-y-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void search();
            }}
          >
            <label htmlFor="community-place" className="block text-sm font-semibold">
              Search a village or town
            </label>
            <div className="flex gap-2">
              <input id="community-place" value={q} onChange={(ev) => setQ(ev.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border border-forest-900/20 px-3" placeholder="e.g. Polonnaruwa" />
              <Button type="submit" variant="secondary" disabled={searching}>
                {searching ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Search
              </Button>
            </div>
            {results.length ? (
              <ul className="max-h-48 divide-y divide-forest-900/10 overflow-auto rounded-xl border border-forest-900/10">
                {results.map((r, i) => (
                  <li key={i}>
                    <button type="button" className="w-full cursor-pointer px-3 py-2 text-left hover:bg-sage-100" onClick={() => void choosePlace(r.latitude, r.longitude)}>
                      <span className="block font-semibold">{r.name}</span>
                      <span className="block text-xs text-ink-muted">{r.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            ) : null}
          </form>
          <div>
            <p className="mb-2 text-sm font-semibold">Areas where farmers have shared experiences</p>
            {areas.isLoading ? <p className="text-sm text-ink-muted">Loading…</p> : null}
            {areas.data && !areas.data.length ? <p className="text-sm text-ink-muted">No experiences have been shared yet.</p> : null}
            <div className="max-h-56 space-y-3 overflow-auto">
              {[...byCountry.entries()].map(([country, list]) => (
                <div key={country}>
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{country}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {list.map((a) => (
                      <button
                        key={`${a.admin1Code}-${a.admin2Code}`}
                        type="button"
                        className="min-h-10 cursor-pointer rounded-full border border-forest-900/15 bg-white px-3 text-sm font-semibold hover:border-emerald-600"
                        onClick={() => {
                          setManualArea({ countryCode: a.countryCode, countryName: a.countryName, admin1Code: a.admin1Code, admin1Name: a.admin1Name, admin2Code: a.admin2Code, admin2Name: a.admin2Name });
                          onOpenChange(false);
                        }}
                      >
                        {a.admin2Name ?? a.admin1Name ?? a.countryName} <span className="text-ink-muted">({a.count})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Notices & states ------------------------------ */
export function CommunityPrivacyNotice({ className }: { className?: string }) {
  return (
    <Card className={cn('flex gap-3 p-4 text-sm', className)}>
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
      <div>
        <p className="font-semibold">Anonymous and honest</p>
        <p className="text-ink-muted">
          Experiences never show names, accounts or exact farm locations — only a general area. They are personal observations, not NASA data, scientific evidence or crop
          recommendations, and they are not used by the Rotation Lab.
        </p>
      </div>
    </Card>
  );
}

export function CommunityEmptyState({ message }: { message: string }) {
  return (
    <Card className="grid place-items-center p-10 text-center" data-testid="community-empty">
      <svg viewBox="0 0 120 80" className="h-24 w-36" aria-hidden>
        <ellipse cx="60" cy="70" rx="50" ry="6" fill="#ebe7d9" />
        <path d="M60 68V34" stroke="#16805d" strokeWidth="4" strokeLinecap="round" />
        <path d="M60 46c-12 0-18-8-18-18 12 0 18 8 18 18zM60 38c10 0 16-7 16-16-10 0-16 7-16 16z" fill="#8fbfa5" />
        <circle cx="30" cy="58" r="6" fill="#d6ac60" />
        <circle cx="92" cy="56" r="5" fill="#d6ac60" opacity=".7" />
      </svg>
      <p className="mt-3 text-lg font-semibold">{message}</p>
      <p className="mt-1 max-w-md text-ink-muted">Be the first to help farmers nearby. Your name and account will not be shown.</p>
      <Button asChild className="mt-4" size="lg">
        <Link to="/community/share">Share an experience</Link>
      </Button>
    </Card>
  );
}
