import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, EyeOff, PenLine, ShieldAlert, ThumbsUp, Trash2, XCircle, MapPin, Gavel } from 'lucide-react';
import type { MyExperience } from '@fieldverse/contracts';
import { PageContainer, PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { useCropMap, useSession } from '@/hooks/queries';
import { communityApi } from '@/services/api';
import { cn, formatDate } from '@/lib/utils';
import { areaLabel } from '@/features/community/CommunityAreaContext';
import { ExperienceVisual, experienceHeading } from '@/features/community/CommunityParts';

const STATUS: Record<MyExperience['moderationStatus'], { label: string; Icon: typeof Clock; cls: string; help: string }> = {
  pending: { label: 'Waiting for review', Icon: Clock, cls: 'bg-[#fdf0d5] text-warning', help: 'A moderator will check it before other farmers can see it.' },
  published: { label: 'Published', Icon: CheckCircle2, cls: 'bg-[#e3f3ea] text-good', help: 'Other farmers can see it.' },
  hidden: { label: 'Hidden for review', Icon: EyeOff, cls: 'bg-cream-200 text-ink-muted', help: 'Not visible while a moderator reviews it.' },
  removed: { label: 'Removed', Icon: XCircle, cls: 'bg-[#fde3e1] text-critical', help: 'Removed by a moderator. You can still delete it.' },
};

export default function MyExperiencesPage() {
  const { map } = useCropMap();
  const session = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['community', 'mine'], queryFn: communityApi.mine });
  const del = useMutation({ mutationFn: communityApi.remove, onSuccess: () => qc.invalidateQueries({ queryKey: ['community'] }) });
  const isModerator = ['moderator', 'admin'].includes(session.data?.user?.role ?? '');

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="FieldVerse Community"
        title="My experiences"
        intro="Only you can see this list and the review status. Other farmers never see your name or account."
        actions={
          <>
            <Button asChild>
              <Link to="/community/share">
                <PenLine aria-hidden /> Share an experience
              </Link>
            </Button>
            {isModerator ? (
              <Button asChild variant="secondary">
                <Link to="/community/moderation">
                  <Gavel aria-hidden /> Moderation
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data && !q.data.length ? (
        <Card className="p-8 text-center">
          <p className="text-lg font-semibold">You have not shared any experiences yet.</p>
          <Button asChild className="mt-4">
            <Link to="/community/share">Share your first experience</Link>
          </Button>
        </Card>
      ) : null}
      <ul className="space-y-4">
        {(q.data ?? []).map((e) => {
          const s = STATUS[e.moderationStatus];
          return (
            <li key={e.id}>
              <Card className="space-y-3 p-5" data-testid="my-experience">
                <div className="flex flex-wrap items-start gap-3">
                  <ExperienceVisual e={e} size={56} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg">{experienceHeading(e, map)}</h2>
                    <p className="flex items-center gap-1 text-sm text-ink-muted">
                      <MapPin className="size-4 text-emerald-600" aria-hidden /> Public location: {areaLabel(e.publicLocation)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Shared {formatDate(e.postedOn)}
                      {e.edited ? ' · edited' : ''}
                    </p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold', s.cls)} data-testid="moderation-status">
                    <s.Icon className="size-4" aria-hidden /> {s.label}
                  </span>
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-sm">{e.description}</p>
                <p className="text-xs text-ink-muted">
                  {s.help}
                  {e.moderationMessage ? ` Note from the moderator: “${e.moderationMessage}”` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2 border-t border-forest-900/5 pt-3">
                  <span className="inline-flex items-center gap-1 text-sm">
                    <ThumbsUp className="size-4" aria-hidden /> {e.helpfulCount} found this helpful
                  </span>
                  {e.openReports ? (
                    <span className="inline-flex items-center gap-1 text-sm text-warning">
                      <ShieldAlert className="size-4" aria-hidden /> Being reviewed after reports
                    </span>
                  ) : null}
                  <span className="flex-1" />
                  {e.moderationStatus === 'published' ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/community/experiences/${e.id}`}>View</Link>
                    </Button>
                  ) : null}
                  {e.moderationStatus !== 'removed' ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/community/share?edit=${e.id}`} data-testid="edit-experience">
                        <PenLine aria-hidden /> Edit
                      </Link>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => confirm('Delete this experience permanently?') && del.mutate(e.id)} data-testid="delete-experience">
                    <Trash2 aria-hidden /> Delete
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {del.isError ? <ErrorState className="mt-4" error={del.error} /> : null}
    </PageContainer>
  );
}
