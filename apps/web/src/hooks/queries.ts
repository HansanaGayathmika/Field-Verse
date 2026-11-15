import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ScenarioAssumptions } from '@fieldverse/contracts';
import { api } from '@/services/api';
import { comparisonRequest, gapRequest, scenarioRequest, type FarmProfile } from '@/contexts/FarmContext';
import { usePreferences } from '@/contexts/PreferencesContext';

const HOUR = 60 * 60 * 1000;

export const useRegions = () => useQuery({ queryKey: ['regions'], queryFn: api.regions, staleTime: HOUR });
export const useCrops = () => useQuery({ queryKey: ['crops'], queryFn: api.crops, staleTime: HOUR });
export const CUSTOM_REGION_ID = 'custom';

/** Live observations for any point on Earth. */
export const usePointObservations = (lat: number | null | undefined, lon: number | null | undefined) =>
  useQuery({
    queryKey: ['pointObservations', lat == null ? null : Math.round(lat * 100) / 100, lon == null ? null : Math.round(lon * 100) / 100],
    queryFn: () => api.pointObservations(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: HOUR,
    retry: 1,
  });

/** Observations for a farm: prepared fixtures for demo regions, live data for custom locations. */
export function useFarmObservations(target: { regionId: string; latitude: number; longitude: number } | null) {
  const isCustom = target?.regionId === CUSTOM_REGION_ID;
  const prepared = useObservations(target && !isCustom ? target.regionId : undefined);
  const live = usePointObservations(isCustom ? target!.latitude : null, isCustom ? target!.longitude : null);
  return isCustom ? live : prepared;
}

export const useObservations = (regionId: string | undefined) =>
  useQuery({ queryKey: ['observations', regionId], queryFn: () => api.observations(regionId!), enabled: !!regionId, staleTime: HOUR });

export function useCropMap() {
  const q = useCrops();
  const map = new Map((q.data ?? []).map((c) => [c.id, c]));
  return { ...q, map };
}

export function useComparison(farm: FarmProfile | null) {
  const { forceDemo } = usePreferences();
  const body = farm ? comparisonRequest(farm) : null;
  return useQuery({
    queryKey: ['compare', body, forceDemo],
    queryFn: ({ signal }) => api.compareRotations(body!, signal),
    enabled: !!body,
    staleTime: 5 * 60 * 1000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useScenario(farm: FarmProfile | null, scenario: ScenarioAssumptions, enabled = true) {
  const { forceDemo } = usePreferences();
  const body = farm ? scenarioRequest(farm, scenario) : null;
  return useQuery({
    queryKey: ['scenario', body, forceDemo],
    queryFn: ({ signal }) => api.analyzeScenario(body!, signal),
    enabled: !!body && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useGaps(farm: FarmProfile | null, idleMonths: number[]) {
  const { forceDemo } = usePreferences();
  const body = farm ? gapRequest(farm, [...idleMonths].sort((a, b) => a - b)) : null;
  return useQuery({
    queryKey: ['gaps', body, forceDemo],
    queryFn: ({ signal }) => api.analyzeGaps(body!, signal),
    enabled: !!body,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export const useAnalysisStatus = () => useQuery({ queryKey: ['analysisStatus'], queryFn: api.analysisStatus, staleTime: 60_000 });
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 30_000, retry: false });
export const useSession = () => useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: 60_000, retry: false });
