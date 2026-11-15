import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPin, Pencil, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FIXTURE_NAMES, RECOMMEND_MODE, RecommendError, getRecommendation } from '../api/recommend';
import { loadDevFixture, loadSubmittedInput, saveDevFixture } from '../form/draft';
import { useRT } from '../i18n';
import { Results } from './Results';

const DEV_TOOLS = import.meta.env.DEV && RECOMMEND_MODE === 'mock';

export default function RecommendResultsPage() {
  const { t } = useRT();
  const navigate = useNavigate();
  const [input] = useState(loadSubmittedInput);
  const [fixture, setFixture] = useState(() => (DEV_TOOLS ? loadDevFixture() : ''));
  const editAnswers = () => navigate('/recommend');

  const q = useQuery({
    queryKey: ['recommend', input, fixture],
    queryFn: ({ signal }) => getRecommendation(input!, { fixture: fixture || undefined, signal }),
    enabled: !!input,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">{t('title')}</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">{t('results.title')}</h1>
          <p className="mt-2 text-lg text-ink-muted">{t('results.subtitle')}</p>
          {input ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-muted">
              <MapPin className="size-4" aria-hidden /> {input.location.lat.toFixed(4)}, {input.location.lon.toFixed(4)}
            </p>
          ) : null}
        </div>
        {input ? (
          <Button variant="secondary" size="lg" onClick={editAnswers} data-testid="rec-edit-answers">
            <Pencil aria-hidden /> {t('results.editAnswers')}
          </Button>
        ) : null}
      </div>

      {DEV_TOOLS && input ? (
        <label className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-warning/60 bg-[#fdf6e7] px-3 py-2 text-xs font-semibold text-warning">
          {t('dev.fixture')}
          <select
            className="h-8 rounded-md border border-forest-900/20 bg-white px-2 text-forest-900"
            value={fixture}
            onChange={(e) => {
              setFixture(e.target.value);
              saveDevFixture(e.target.value);
            }}
            data-testid="rec-results-fixture"
          >
            <option value="">{t('dev.auto')}</option>
            {FIXTURE_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-8">
        {!input ? (
          <div className="rounded-3xl bg-white p-8 text-center" data-testid="rec-no-input">
            <p className="text-lg">{t('results.noInput')}</p>
            <Button asChild size="lg" className="mt-4">
              <Link to="/recommend">{t('results.noInputAction')}</Link>
            </Button>
          </div>
        ) : q.isPending ? (
          <div role="status" aria-live="polite" className="grid place-items-center gap-3 rounded-3xl bg-white p-12 text-center" data-testid="rec-loading">
            <Loader2 className="size-10 animate-spin text-emerald-600" aria-hidden />
            <p className="text-xl font-semibold text-forest-900">{t('results.loading')}</p>
            <p className="text-ink-muted">{t('results.loadingHelp')}</p>
          </div>
        ) : q.isError ? (
          <ErrorScreen error={q.error} onRetry={() => void q.refetch()} onEdit={editAnswers} retrying={q.isFetching} />
        ) : (
          <Results rec={q.data} priorities={input.priorities} onChangeAnswers={editAnswers} />
        )}
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry, onEdit, retrying }: { error: unknown; onRetry: () => void; onEdit: () => void; retrying: boolean }) {
  const { t } = useRT();
  const kind = error instanceof RecommendError ? error.kind : 'network';
  const invalid = kind === 'invalid_input';
  return (
    <div role="alert" className="rounded-3xl border border-forest-900/10 bg-white p-8 text-center" data-testid="rec-error" data-kind={kind}>
      <WifiOff className="mx-auto size-10 text-ink-muted" aria-hidden />
      <h2 className="mt-3 text-2xl">{t('errors.title')}</h2>
      <p className="mx-auto mt-2 max-w-lg text-lg">{t(`errors.${kind}`)}</p>
      {invalid && error instanceof RecommendError && error.detail ? (
        <p className="mx-auto mt-2 max-w-lg rounded-xl bg-cream-100 p-3 text-sm">{error.detail}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {invalid ? (
          <Button size="lg" onClick={onEdit}>
            <Pencil aria-hidden /> {t('results.changeAnswers')}
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={onRetry} disabled={retrying} data-testid="rec-retry">
              {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} {t('errors.retry')}
            </Button>
            <Button size="lg" variant="secondary" onClick={onEdit}>
              <Pencil aria-hidden /> {t('results.changeAnswers')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
