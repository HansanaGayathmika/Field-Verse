import { CheckCircle2, CircleAlert, Database, ExternalLink, FlaskConical, ServerCog } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '@/components/Page';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProvenanceBadge } from '@/components/Provenance';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { useAnalysisStatus, useHealth } from '@/hooks/queries';
import { api } from '@/services/api';
import { formatDate } from '@/lib/utils';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useFarm } from '@/contexts/FarmContext';
import { Button } from '@/components/ui/button';

export default function DataSourcesPage() {
  const health = useHealth();
  const status = useAnalysisStatus();
  const sources = useQuery({ queryKey: ['dataSources'], queryFn: api.dataSourcesStatus });
  const { forceDemo, setForceDemo } = usePreferences();
  const { farm, clearFarm } = useFarm();

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader eyebrow="Transparency" title="Data, sources and system status" intro="Everything FieldVerse shows comes from one of the sources below, and is labelled with how it was produced." />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5" data-testid="analysis-status">
          <h2 className="flex items-center gap-2 text-xl">
            <ServerCog className="size-5 text-emerald-600" aria-hidden /> Analysis provider
          </h2>
          {status.isLoading ? <LoadingBlock rows={2} className="mt-3 border-0 p-0" /> : null}
          {status.data ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Mode</dt><dd className="font-semibold">{status.data.provider === 'demo' ? 'Demo (illustrative fixtures)' : 'Remote AI/ML service'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Status</dt><dd className="font-semibold">{status.data.status}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Name</dt><dd className="text-right font-semibold">{status.data.name}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Model version</dt><dd className="font-semibold">{status.data.modelVersion ?? 'none'}</dd></div>
              {status.data.message ? <p className="pt-2 text-ink-muted">{status.data.message}</p> : null}
            </dl>
          ) : null}
          {forceDemo ? (
            <div className="mt-3 rounded-xl bg-gold-100 p-3 text-sm">
              You chose to see labelled demo results.{' '}
              <Button size="sm" variant="link" onClick={() => setForceDemo(false)}>
                Use the configured provider again
              </Button>
            </div>
          ) : null}
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-xl">
            <Database className="size-5 text-emerald-600" aria-hidden /> Server &amp; database
          </h2>
          {health.isError ? <ErrorState className="mt-3" error={health.error} /> : null}
          {health.data ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">API</dt><dd className="flex items-center gap-1 font-semibold"><CheckCircle2 className="size-4 text-good" aria-hidden /> running (v{health.data.version})</dd></div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Database</dt>
                <dd className="flex items-center gap-1 font-semibold">
                  {health.data.database.status === 'connected' ? <CheckCircle2 className="size-4 text-good" aria-hidden /> : <CircleAlert className="size-4 text-warning" aria-hidden />}
                  {health.data.database.status}
                </dd>
              </div>
              {health.data.database.status !== 'connected' ? <p className="pt-2 text-ink-muted">Saving farms and plans is unavailable. The public demo still works.</p> : null}
            </dl>
          ) : null}
        </Card>
      </div>

      <section className="mt-10" aria-labelledby="src-title">
        <h2 id="src-title" className="text-2xl">
          Data sources
        </h2>
        {sources.isLoading ? <LoadingBlock /> : null}
        {sources.isError ? <ErrorState error={sources.error} onRetry={() => sources.refetch()} /> : null}
        <div className="mt-4 grid gap-4">
          {sources.data?.sources.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg">{s.name}</h3>
                  {s.provider ? <p className="text-sm text-ink-muted">{s.provider}</p> : null}
                </div>
                <div className="flex gap-2">
                  <ProvenanceBadge type={s.sourceType} />
                  {s.status === 'demo' ? <Badge variant="gold"><FlaskConical aria-hidden /> to be replaced by ML</Badge> : null}
                </div>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {s.datasetVersion ? <div><dt className="inline text-ink-muted">Version: </dt><dd className="inline">{s.datasetVersion}</dd></div> : null}
                {s.spatialResolution ? <div><dt className="inline text-ink-muted">Resolution: </dt><dd className="inline">{s.spatialResolution}</dd></div> : null}
                {s.temporalCoverage ? <div><dt className="inline text-ink-muted">Period: </dt><dd className="inline">{s.temporalCoverage}</dd></div> : null}
                {s.retrievedAt ? <div><dt className="inline text-ink-muted">Prepared: </dt><dd className="inline">{formatDate(s.retrievedAt)}</dd></div> : null}
                {s.license ? <div><dt className="inline text-ink-muted">Licence: </dt><dd className="inline">{s.license}</dd></div> : null}
                <div><dt className="inline text-ink-muted">Regions: </dt><dd className="inline">{s.regions.length}</dd></div>
              </dl>
              {s.usedFor.length ? <p className="mt-2 text-sm"><strong>Used for:</strong> {s.usedFor.join(', ')}</p> : null}
              {s.notes ? <p className="mt-2 text-sm text-ink-muted">{s.notes}</p> : null}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
                  Example data request <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      <section id="privacy" className="mt-10 rounded-3xl bg-white p-6 shadow-[var(--shadow-card)]" aria-labelledby="privacy-title">
        <h2 id="privacy-title" className="text-2xl">
          Privacy
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>The public demo does not need an account. Your farm details are stored only in this browser until you press “Save”.</li>
          <li>
            Your device location is used only if you press “Use my current location”, and your browser asks your permission first. You can always tap the map or type coordinates instead.
          </li>
          <li>
            For a location outside the demo regions, our server fetches climate data from NASA POWER and soil estimates from ISRIC SoilGrids. Only the coordinates are sent, rounded to about 1 km,
            and never your name or email.
          </li>
          <li>Saved farms and plans are private: only your browser session (or your account) can read them. Temporary demo saves are deleted automatically after 30 days.</li>
          <li>Analysis requests send your farm description (not your name or email) to the FieldVerse server, which forwards it to the analysis service.</li>
          <li>Map tiles are loaded from OpenStreetMap servers. Turn on low-bandwidth mode to avoid loading them.</li>
        </ul>
        {farm ? (
          <Button variant="secondary" className="mt-4" onClick={() => confirm('Remove the farm stored in this browser?') && clearFarm()}>
            Clear my farm from this browser
          </Button>
        ) : null}
      </section>
    </PageContainer>
  );
}
