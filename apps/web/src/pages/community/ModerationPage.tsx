import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, EyeOff, Flag, XCircle } from 'lucide-react';
import { REPORT_REASON_LABELS } from '@fieldverse/contracts';
import { PageContainer, PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { useCropMap } from '@/hooks/queries';
import { communityApi } from '@/services/api';
import { formatDate } from '@/lib/utils';
import { areaLabel } from '@/features/community/CommunityAreaContext';
import { ExperienceVisual, experienceHeading } from '@/features/community/CommunityParts';

/** Moderator review queue. Permissions are enforced by the API (403 for everyone else). */
export default function ModerationPage() {
  const { map } = useCropMap();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['community', 'queue'], queryFn: communityApi.queue, retry: false });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const act = useMutation({
    mutationFn: (v: { id: string; status: 'published' | 'hidden' | 'removed' }) => communityApi.moderate(v.id, v.status, notes[v.id]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community'] }),
  });

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader eyebrow="FieldVerse Community" title="Moderation" intro="Review new and reported experiences. Authors and reporters stay anonymous here too." />
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <ErrorState error={q.error} /> : null}
      {q.data && !q.data.length ? <Card className="p-8 text-center text-lg font-semibold">Nothing waiting for review.</Card> : null}
      <ul className="space-y-4">
        {(q.data ?? []).map((e) => (
          <li key={e.id}>
            <Card className="space-y-3 p-5" data-testid="moderation-item">
              <div className="flex flex-wrap items-start gap-3">
                <ExperienceVisual e={e} size={56} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg">{experienceHeading(e, map)}</h2>
                  <p className="text-sm text-ink-muted">
                    {areaLabel(e.publicLocation)} · {formatDate(e.postedOn)}
                    {e.edited ? ' · edited' : ''}
                  </p>
                </div>
                <Badge variant={e.moderationStatus === 'pending' ? 'warning' : 'neutral'}>{e.moderationStatus}</Badge>
              </div>
              <p className="whitespace-pre-line text-sm">{e.description}</p>
              {e.lessonsLearned ? <p className="whitespace-pre-line rounded-xl bg-sage-100 p-3 text-sm">{e.lessonsLearned}</p> : null}
              {e.reports.length ? (
                <ul className="space-y-1 rounded-xl bg-[#fff6f5] p-3 text-sm">
                  {e.reports.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <Flag className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden /> {REPORT_REASON_LABELS[r.reason]} ({formatDate(r.reportedOn)}){r.details ? ` — “${r.details}”` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="block text-sm font-semibold">
                Note to the author (optional, only they see it)
                <input
                  value={notes[e.id] ?? ''}
                  onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))}
                  maxLength={300}
                  className="mt-1 h-10 w-full rounded-lg border border-forest-900/20 px-3 font-normal"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => act.mutate({ id: e.id, status: 'published' })} disabled={act.isPending} data-testid="approve">
                  <CheckCircle2 aria-hidden /> Publish
                </Button>
                <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: e.id, status: 'hidden' })} disabled={act.isPending}>
                  <EyeOff aria-hidden /> Keep hidden
                </Button>
                <Button size="sm" variant="danger" onClick={() => act.mutate({ id: e.id, status: 'removed' })} disabled={act.isPending}>
                  <XCircle aria-hidden /> Remove
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {act.isError ? <ErrorState className="mt-4" error={act.error} /> : null}
    </PageContainer>
  );
}
