import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Compass, Info, Loader2, PenLine, Search, X } from 'lucide-react';
import { COMMUNITY_CATEGORY_LABELS, CommunityCategorySchema, type CommunityCategory, type FeedQuery } from '@fieldverse/contracts';
import { PageContainer, PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { cropLabel } from '@/components/CropVisual';
import { useCropMap } from '@/hooks/queries';
import { communityApi } from '@/services/api';
import { cn } from '@/lib/utils';
import { useCommunityArea } from '@/features/community/CommunityAreaContext';
import {
  CATEGORY_ICONS,
  ChangeAreaDialog,
  CommunityEmptyState,
  CommunityExperienceCard,
  CommunityLocationBanner,
  CommunityPrivacyNotice,
} from '@/features/community/CommunityParts';

type Scope = 'auto' | 'admin2' | 'admin1' | 'country' | 'world';
type Sort = 'relevant' | 'recent' | 'helpful';

export default function CommunityPage() {
  const [params, setParams] = useSearchParams();
  const { area, levelLabels } = useCommunityArea();
  const { data: crops, map } = useCropMap();
  const [qInput, setQInput] = useState(params.get('q') ?? '');
  const [areaOpen, setAreaOpen] = useState(false);

  const scope = (params.get('scope') as Scope) || 'auto';
  const sort = (params.get('sort') as Sort) || 'relevant';
  const cropId = params.get('crop') || undefined;
  const category = (params.get('category') as CommunityCategory) || undefined;
  const q = params.get('q') || undefined;
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const query: Partial<FeedQuery> = {
    countryCode: area?.countryCode,
    admin1Code: area?.admin1Code ?? undefined,
    admin2Code: area?.admin2Code ?? undefined,
    scope: area ? scope : 'world',
    sort,
    cropId,
    category,
    q,
    pageSize: 10,
  };
  const feed = useInfiniteQuery({
    queryKey: ['community', 'feed', query],
    queryFn: ({ pageParam }) => communityApi.feed({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const first = feed.data?.pages[0];
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  const scopeOptions: { value: Scope; label: string; disabled?: boolean }[] = [
    { value: 'auto', label: 'Nearby first' },
    { value: 'admin2', label: area?.admin2Name ? `My ${levelLabels.admin2.toLowerCase()}` : `My ${levelLabels.admin2.toLowerCase()}`, disabled: !area?.admin2Code },
    { value: 'admin1', label: `My ${levelLabels.admin1.toLowerCase()}`, disabled: !area?.admin1Code },
    { value: 'country', label: 'My country', disabled: !area },
    { value: 'world', label: 'Other countries too' },
  ];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="FieldVerse Community · Learn from farmers near you"
        title="Farmers Helping Farmers"
        intro="Explore farming experiences shared by people in your area."
        actions={
          <>
            <Button asChild size="lg">
              <Link to="/community/share" data-testid="share-experience">
                <PenLine aria-hidden /> Share my experience
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link to="/community/my-experiences">
                <BookOpen aria-hidden /> My experiences
              </Link>
            </Button>
          </>
        }
      />

      <CommunityLocationBanner />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => document.getElementById('community-feed')?.scrollIntoView({ behavior: 'smooth' })}>
          <BookOpen aria-hidden /> Explore experiences
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAreaOpen(true)} data-testid="explore-another-region">
          <Compass aria-hidden /> Explore another region
        </Button>
        <ChangeAreaDialog open={areaOpen} onOpenChange={setAreaOpen} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        {/* Filters */}
        <aside className="space-y-5" aria-label="Filters">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              set('q', qInput.trim() || null);
            }}
          >
            <label htmlFor="community-search" className="mb-1 block text-sm font-semibold">
              Search experiences
            </label>
            <div className="flex gap-2">
              <input
                id="community-search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                maxLength={100}
                placeholder="e.g. drainage, tank, beans"
                className="h-11 min-w-0 flex-1 rounded-lg border border-forest-900/20 bg-white px-3"
                data-testid="community-search"
              />
              <Button type="submit" size="icon" variant="secondary" aria-label="Search">
                <Search aria-hidden />
              </Button>
            </div>
            {q ? (
              <button type="button" className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-emerald-700" onClick={() => { setQInput(''); set('q', null); }}>
                <X className="size-3" aria-hidden /> Clear search “{q}”
              </button>
            ) : null}
          </form>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Where</legend>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              {scopeOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={o.disabled}
                  aria-pressed={scope === o.value}
                  data-testid={`scope-${o.value}`}
                  onClick={() => set('scope', o.value === 'auto' ? null : o.value)}
                  className={cn(
                    'min-h-10 cursor-pointer rounded-full border-2 px-4 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40',
                    scope === o.value ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-forest-900/15 bg-white hover:border-sage-400',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm font-semibold">
            Crop
            <select value={cropId ?? ''} onChange={(e) => set('crop', e.target.value || null)} className="mt-1 h-11 w-full rounded-lg border border-forest-900/20 bg-white px-3 font-normal" data-testid="crop-filter">
              <option value="">All crops</option>
              {(crops ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.names.en}
                </option>
              ))}
              {cropId && !map.get(cropId) ? <option value={cropId}>{cropLabel(map, cropId)}</option> : null}
            </select>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Topic</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={!category} onClick={() => set('category', null)} className={cn('min-h-9 cursor-pointer rounded-full border px-3 text-sm', !category ? 'border-emerald-600 bg-emerald-100 font-semibold' : 'border-forest-900/15 bg-white')}>
                All topics
              </button>
              {CommunityCategorySchema.options.map((c) => {
                const Icon = CATEGORY_ICONS[c];
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    data-testid={`topic-${c}`}
                    onClick={() => set('category', category === c ? null : c)}
                    className={cn('inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border px-3 text-sm', category === c ? 'border-emerald-600 bg-emerald-100 font-semibold' : 'border-forest-900/15 bg-white')}
                  >
                    <Icon className="size-3.5" aria-hidden /> {COMMUNITY_CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block text-sm font-semibold">
            Sort by
            <select value={sort} onChange={(e) => set('sort', e.target.value === 'relevant' ? null : e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-forest-900/20 bg-white px-3 font-normal" data-testid="sort-select">
              <option value="relevant">Most relevant location</option>
              <option value="recent">Most recent</option>
              <option value="helpful">Most helpful</option>
            </select>
          </label>

          <CommunityPrivacyNotice />
        </aside>

        {/* Feed */}
        <section id="community-feed" aria-labelledby="feed-title" aria-busy={feed.isFetching}>
          <h2 id="feed-title" className="sr-only">
            Experiences
          </h2>
          {first ? (
            <p className="mb-4 flex gap-2 rounded-xl bg-sage-100 p-3 text-sm" data-testid="feed-explanation">
              <Info className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
              <span>
                {first.explanation} {first.total} experience{first.total === 1 ? '' : 's'} found.
                {cropId ? ` Crop: ${cropLabel(map, cropId)}.` : ''}
                {category ? ` Topic: ${COMMUNITY_CATEGORY_LABELS[category]}.` : ''}
              </span>
            </p>
          ) : null}
          {feed.isLoading ? <LoadingBlock label="Loading experiences…" /> : null}
          {feed.isError ? <ErrorState error={feed.error} onRetry={() => feed.refetch()} /> : null}
          {feed.isSuccess && items.length === 0 ? (
            <CommunityEmptyState message={q || cropId || category ? 'No experiences match these filters yet.' : 'No farming experiences have been shared for this area yet.'} />
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            <AnimatePresence initial={false}>
              {items.map((e, i) => (
                <motion.div key={e.id} layout exit={{ opacity: 0 }}>
                  <CommunityExperienceCard e={e} index={i} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {feed.hasNextPage ? (
            <div className="mt-6 text-center">
              <Button variant="secondary" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage} data-testid="load-more">
                {feed.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null} Show more experiences
              </Button>
            </div>
          ) : null}
          {first && first.levelCounts.world > first.total && scope !== 'world' ? (
            <Card className="mt-6 p-4 text-sm">
              {first.levelCounts.world - first.total} more experience(s) from other places.{' '}
              <button type="button" className="cursor-pointer font-semibold text-emerald-700 underline" onClick={() => set('scope', 'world')}>
                Show other countries too
              </button>
            </Card>
          ) : null}
        </section>
      </div>
    </PageContainer>
  );
}
