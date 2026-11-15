import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminArea, ResolvedArea } from '@fieldverse/contracts';
import { communityApi } from '@/services/api';
import { useFarm } from '@/contexts/FarmContext';

/**
 * The area the Community feed is centred on.
 *  - By default it is the farm's location, converted by the server into a COARSE
 *    administrative area (district / province / country). Coordinates are not kept here.
 *  - The farmer may choose a different area; that choice is remembered in this browser.
 */
type LevelLabels = ResolvedArea['levelLabels'];
interface CommunityAreaState {
  area: AdminArea | null;
  levelLabels: LevelLabels;
  source: 'farm' | 'manual' | null;
  isLoading: boolean;
  error: unknown;
  hasFarm: boolean;
  setManualArea: (area: AdminArea, levelLabels?: LevelLabels) => void;
  resetToFarmArea: () => void;
}

const KEY = 'fv.community.area.v1';
const DEFAULT_LABELS: LevelLabels = { admin1: 'Region', admin2: 'District' };
const Ctx = createContext<CommunityAreaState | null>(null);

function loadManual(): { area: AdminArea; levelLabels: LevelLabels } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function areaLabel(a: Pick<AdminArea, 'admin2Name' | 'admin1Name' | 'countryName'> | null | undefined) {
  if (!a) return '';
  return [a.admin2Name, a.admin1Name, a.countryName].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ');
}

/** Resolve the farm's location to a coarse area (cached; rounded on the server). */
export function useFarmCommunityArea() {
  const { farm } = useFarm();
  return useQuery({
    queryKey: ['communityArea', farm ? Math.round(farm.latitude * 100) / 100 : null, farm ? Math.round(farm.longitude * 100) / 100 : null],
    queryFn: () => communityApi.resolve(farm!.latitude, farm!.longitude),
    enabled: !!farm,
    staleTime: 24 * 3600_000,
    retry: 1,
  });
}

export function CommunityAreaProvider({ children }: { children: ReactNode }) {
  const { farm } = useFarm();
  const [manual, setManual] = useState(loadManual);
  const farmArea = useFarmCommunityArea();

  const setManualArea = useCallback((area: AdminArea, levelLabels: LevelLabels = DEFAULT_LABELS) => {
    const v = { area, levelLabels };
    setManual(v);
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, []);
  const resetToFarmArea = useCallback(() => {
    setManual(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<CommunityAreaState>(() => {
    if (manual) return { area: manual.area, levelLabels: manual.levelLabels, source: 'manual', isLoading: false, error: null, hasFarm: !!farm, setManualArea, resetToFarmArea };
    if (farm && farmArea.data) return { area: farmArea.data.area, levelLabels: farmArea.data.levelLabels, source: 'farm', isLoading: false, error: null, hasFarm: true, setManualArea, resetToFarmArea };
    return { area: null, levelLabels: DEFAULT_LABELS, source: null, isLoading: !!farm && farmArea.isLoading, error: farmArea.error, hasFarm: !!farm, setManualArea, resetToFarmArea };
  }, [manual, farm, farmArea.data, farmArea.isLoading, farmArea.error, setManualArea, resetToFarmArea]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommunityArea() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCommunityArea must be used inside CommunityAreaProvider');
  return v;
}
