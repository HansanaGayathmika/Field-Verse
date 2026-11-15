import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowLeft, CalendarDays, CloudRain, Droplets, Layers, MapPin } from 'lucide-react';
import { COMMUNITY_CATEGORY_LABELS } from '@fieldverse/contracts';
import { PageContainer } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { cropLabel } from '@/components/CropVisual';
import { useCropMap } from '@/hooks/queries';
import { communityApi } from '@/services/api';
import { formatDate } from '@/lib/utils';
import { areaLabel } from '@/features/community/CommunityAreaContext';
import { CommunityPrivacyNotice, ExperienceVisual, HelpfulButton, HONESTY_LINE, ReportButton, VerificationNote, experienceHeading } from '@/features/community/CommunityParts';

const IRRIGATION: Record<string, string> = { rainfed: 'Rain only', tank_canal: 'Tank or canal', well_pump: 'Well or pump', drip_sprinkler: 'Drip or sprinkler', other: 'Other', unknown: 'Not known' };

export default function ExperienceDetailPage() {
  const { id = '' } = useParams();
  const { map } = useCropMap();
  const q = useQuery({ queryKey: ['community', 'experience', id], queryFn: () => communityApi.experience(id), retry: false });
  const related = useQuery({ queryKey: ['community', 'related', id], queryFn: () => communityApi.related(id), enabled: q.isSuccess });
  const e = q.data;

  return (
    <PageContainer className="max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/community">
          <ArrowLeft aria-hidden /> Community
        </Link>
      </Button>
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <ErrorState error={q.error} /> : null}
      {e ? (
        <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5" data-testid="experience-detail">
          <Card className="space-y-4 p-5 sm:p-8">
            <div className="flex flex-wrap items-start gap-4">
              <ExperienceVisual e={e} size={88} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Farmer experience</p>
                <h1 className="text-2xl sm:text-3xl">{experienceHeading(e, map)}</h1>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="green">{COMMUNITY_CATEGORY_LABELS[e.category]}</Badge>
                  {e.cropId ? <Badge variant="outline">{cropLabel(map, e.cropId)}</Badge> : null}
                  {e.isDemo ? <Badge variant="gold">Demonstration example — not a real farmer</Badge> : null}
                </div>
                <p className="mt-2 flex items-center gap-1 text-sm text-ink-muted">
                  <MapPin className="size-4 text-emerald-600" aria-hidden /> {areaLabel(e.publicLocation)}
                </p>
                <p className="flex items-center gap-1 text-sm text-ink-muted">
                  <CalendarDays className="size-4" aria-hidden /> Shared {formatDate(e.postedOn)}
                  {e.edited ? ' · edited' : ''}
                </p>
              </div>
            </div>
            <p className="whitespace-pre-line text-lg leading-relaxed">{e.description}</p>
            {e.lessonsLearned ? (
              <div className="rounded-2xl bg-sage-100 p-4">
                <p className="font-semibold">What this farmer suggests checking</p>
                <p className="mt-1 whitespace-pre-line">{e.lessonsLearned}</p>
              </div>
            ) : null}
            {e.season || e.approximateYear || e.irrigationMethod || e.soilNotes || e.weatherNotes ? (
              <dl className="grid gap-3 rounded-2xl border border-forest-900/10 p-4 text-sm sm:grid-cols-2">
                {e.season || e.approximateYear ? (
                  <div>
                    <dt className="text-ink-muted">When</dt>
                    <dd className="font-semibold">{[e.season, e.approximateYear].filter(Boolean).join(', ')}</dd>
                  </div>
                ) : null}
                {e.irrigationMethod ? (
                  <div>
                    <dt className="flex items-center gap-1 text-ink-muted"><Droplets className="size-3.5" aria-hidden /> Irrigation</dt>
                    <dd className="font-semibold">{IRRIGATION[e.irrigationMethod]}</dd>
                  </div>
                ) : null}
                {e.soilNotes ? (
                  <div>
                    <dt className="flex items-center gap-1 text-ink-muted"><Layers className="size-3.5" aria-hidden /> Soil</dt>
                    <dd className="whitespace-pre-line">{e.soilNotes}</dd>
                  </div>
                ) : null}
                {e.weatherNotes ? (
                  <div>
                    <dt className="flex items-center gap-1 text-ink-muted"><CloudRain className="size-3.5" aria-hidden /> Weather</dt>
                    <dd className="whitespace-pre-line">{e.weatherNotes}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <div className="rounded-xl bg-gold-100 p-3">
              <VerificationNote />
              <p className="mt-1 text-sm text-[#5c4510]">{HONESTY_LINE} It is not NASA data, scientific evidence or a crop recommendation.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-forest-900/5 pt-4">
              <HelpfulButton e={e} />
              <ReportButton experienceId={e.id} />
            </div>
          </Card>

          <section aria-labelledby="related-title">
            <h2 id="related-title" className="mb-3 text-2xl">
              Related experiences
            </h2>
            {related.data && !related.data.length ? <p className="text-ink-muted">No related experiences yet.</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {(related.data ?? []).map((r) => (
                <Link key={r.id} to={`/community/experiences/${r.id}`} className="flex gap-3 rounded-2xl border border-forest-900/10 bg-white p-4 hover:border-emerald-600" data-testid="related-experience">
                  <ExperienceVisual e={r} size={48} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-emerald-700">{r.relevance?.reason}</span>
                    <span className="block font-semibold">{experienceHeading(r, map)}</span>
                    <span className="line-clamp-2 text-sm text-ink-muted">{r.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
          <CommunityPrivacyNotice />
        </motion.article>
      ) : null}
    </PageContainer>
  );
}
