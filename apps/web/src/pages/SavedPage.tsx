import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FlaskConical, MapPin, Sparkles, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/Page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { useFarm, BASELINE } from '@/contexts/FarmContext';
import { useSession } from '@/hooks/queries';
import { api } from '@/services/api';
import { formatDate } from '@/lib/utils';

export default function SavedPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setFarm } = useFarm();
  const session = useSession();
  const fields = useQuery({ queryKey: ['fields'], queryFn: api.fields, retry: false });
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: api.scenarios, retry: false });
  const delField = useMutation({ mutationFn: api.deleteField, onSuccess: () => qc.invalidateQueries({ queryKey: ['fields'] }) });
  const delScenario = useMutation({ mutationFn: api.deleteScenario, onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }) });

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="Saved"
        title="Saved farms and plans"
        intro={
          session.data?.authenticated
            ? `Signed in as ${session.data.user?.name}. These are visible only to you.`
            : 'Saved in this browser session for 30 days. Create a free account to keep them longer.'
        }
        actions={!session.data?.authenticated ? <Button asChild variant="secondary"><Link to="/register">Create account</Link></Button> : undefined}
      />

      <section aria-labelledby="farms-title">
        <h2 id="farms-title" className="mb-3 text-2xl">
          Farms
        </h2>
        {fields.isLoading ? <LoadingBlock /> : null}
        {fields.isError ? <ErrorState error={fields.error} onRetry={() => fields.refetch()} /> : null}
        {fields.data?.length === 0 ? <p className="text-ink-muted">No saved farms yet. Tick “save this farm” at the end of farm setup.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.data?.map((f) => (
            <Card key={f.id} className="flex flex-col gap-2 p-4">
              <p className="flex items-center gap-2 font-semibold">
                <MapPin className="size-4 text-emerald-600" aria-hidden /> {f.farmName}
              </p>
              <p className="text-sm text-ink-muted">
                {f.regionId} · {f.field.currentCrop} · updated {formatDate(f.updatedAt)}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setFarm({
                      farmName: f.farmName,
                      regionId: f.regionId,
                      latitude: f.field.latitude,
                      longitude: f.field.longitude,
                      currentCrop: f.field.currentCrop,
                      cropHistory: f.field.cropHistory,
                      soilType: f.field.soilType,
                      soilPh: f.field.soilPh ?? null,
                      irrigation: f.field.irrigation,
                      harvestMonth: f.field.harvestMonth ?? null,
                      nextPlantingMonth: f.field.nextPlantingMonth ?? null,
                      seasonsPerYear: f.field.seasonsPerYear ?? null,
                      waterlogging: f.field.waterlogging ?? "unknown",
                      inputLevel: f.field.inputLevel ?? "unknown",
                      excludedCrops: f.field.excludedCrops ?? [],
                      priorities: f.priorities,
                      constraints: f.constraints,
                      scenario: BASELINE,
                      idleMonths: null,
                      planAdditions: [],
                      savedFieldId: f.id,
                      isDemo: false,
                    });
                    navigate('/farm');
                  }}
                >
                  Open
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(`Delete “${f.farmName}”?`) && delField.mutate(f.id)} aria-label={`Delete ${f.farmName}`}>
                  <Trash2 aria-hidden /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="plans-title" className="mt-10">
        <h2 id="plans-title" className="mb-3 text-2xl">
          Plans
        </h2>
        {scenarios.isLoading ? <LoadingBlock /> : null}
        {scenarios.isError ? <ErrorState error={scenarios.error} onRetry={() => scenarios.refetch()} /> : null}
        {scenarios.data?.length === 0 ? <p className="text-ink-muted">No saved plans yet. Use “Save plan” on the decision card.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {scenarios.data?.map((s) => (
            <Card key={s.id} className="flex flex-col gap-2 p-4">
              <p className="flex items-center gap-2 font-semibold">
                <FileText className="size-4 text-emerald-600" aria-hidden /> {s.title}
              </p>
              <div className="flex flex-wrap gap-2">
                {s.mode === 'demo' ? (
                  <Badge variant="gold"><FlaskConical aria-hidden /> Demo results</Badge>
                ) : (
                  <Badge variant="dark"><Sparkles aria-hidden /> Model {s.modelVersion}</Badge>
                )}
                <Badge variant="outline">Analysed {formatDate(s.analysisGeneratedAt)}</Badge>
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" asChild>
                  <Link to={`/plan?saved=${s.id}`}>View</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(`Delete “${s.title}”?`) && delScenario.mutate(s.id)} aria-label={`Delete ${s.title}`}>
                  <Trash2 aria-hidden /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </PageContainer>
  );
}
