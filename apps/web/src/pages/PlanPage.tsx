import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Printer, Save } from 'lucide-react';
import type { RotationComparisonResponse } from '@fieldverse/contracts';
import { FarmSubnav, PageContainer, PageHeader, RequireFarm } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { DecisionCard } from '@/features/plan/DecisionCard';
import { useComparison } from '@/hooks/queries';
import { useFarm, comparisonRequest } from '@/contexts/FarmContext';
import { api } from '@/services/api';
import { formatDate } from '@/lib/utils';
import { describeAnswers } from '@/lib/farmAnswers';
import type { FieldProfile } from '@fieldverse/contracts';

/** Saved plans store the contract field profile; older saves may lack the newer answers. */
function savedProfile(f: FieldProfile): Parameters<typeof describeAnswers>[0] {
  return {
    currentCrop: f.currentCrop,
    cropHistory: f.cropHistory ?? [],
    harvestMonth: f.harvestMonth ?? null,
    nextPlantingMonth: f.nextPlantingMonth ?? null,
    seasonsPerYear: f.seasonsPerYear ?? null,
    irrigation: f.irrigation ?? 'unknown',
    waterlogging: f.waterlogging ?? 'unknown',
    inputLevel: f.inputLevel ?? 'unknown',
    soilType: f.soilType ?? 'unknown',
    soilPh: f.soilPh ?? null,
    excludedCrops: f.excludedCrops ?? [],
  };
}

export default function PlanPage() {
  const [params] = useSearchParams();
  const savedId = params.get('saved');
  if (savedId) return <SavedPlan id={savedId} />;
  return (
    <RequireFarm>
      <CurrentPlan />
    </RequireFarm>
  );
}

function SavedPlan({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['savedScenario', id], queryFn: () => api.scenario(id), retry: false });
  if (q.isLoading) return <PageContainer><LoadingBlock /></PageContainer>;
  if (q.isError) return <PageContainer><ErrorState error={q.error} /></PageContainer>;
  const s = q.data!;
  const analysis = s.analysis as unknown as RotationComparisonResponse;
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader eyebrow={`Saved plan · ${formatDate(s.createdAt)}`} title={s.title} actions={<Button onClick={() => window.print()}><Printer aria-hidden /> Print</Button>} />
      <DecisionCard analysis={analysis} farmName={s.title} constraints={s.farmerInputs.constraints} currentCrop={s.farmerInputs.field.currentCrop} additions={[]} profile={savedProfile(s.farmerInputs.field)} />
    </PageContainer>
  );
}

function CurrentPlan() {
  const { farm } = useFarm();
  const q = useComparison(farm);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(`${farm!.farmName} — plan`);
  const save = useMutation({
    mutationFn: () =>
      api.saveScenario({
        title,
        fieldId: farm!.savedFieldId,
        regionId: farm!.regionId,
        farmerInputs: { field: comparisonRequest(farm!).field as never, priorities: farm!.priorities, constraints: farm!.constraints },
        scenario: q.data!.scenario,
        analysis: q.data as unknown as Record<string, unknown>,
        notes: null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });

  return (
    <PageContainer className="max-w-7xl">
      <FarmSubnav />
      <PageHeader
        eyebrow="My Plan"
        title="Decision card"
        intro="A one-page summary to print or share with your family, cooperative or extension officer."
        actions={
          <Button onClick={() => window.print()} data-testid="print">
            <Printer aria-hidden /> Print
          </Button>
        }
      />
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data ? (
        <>
          <DecisionCard analysis={q.data} farmName={farm!.farmName} constraints={farm!.constraints} currentCrop={farm!.currentCrop} additions={farm!.planAdditions} profile={farm!} />
          <div className="no-print mt-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-5 shadow-[var(--shadow-card)]">
            <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm font-semibold">
              Plan name
              <input className="h-11 rounded-xl border border-forest-900/20 px-3 font-normal" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <Button onClick={() => save.mutate()} disabled={save.isPending || save.isSuccess || !title.trim()} data-testid="save-plan">
              {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : save.isSuccess ? <Check aria-hidden /> : <Save aria-hidden />}
              {save.isSuccess ? 'Saved' : 'Save plan'}
            </Button>
            {save.isSuccess ? (
              <Link to="/saved" className="text-sm font-semibold text-emerald-700 underline">
                View saved plans
              </Link>
            ) : null}
            {save.isError ? <ErrorState className="w-full" error={save.error} /> : null}
            <p className="w-full text-xs text-ink-muted">Saving stores your inputs and these results (including demo/model labels and sources) privately. Without an account, saves are kept for 30 days in this browser session.</p>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}

