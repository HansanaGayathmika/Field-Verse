import type {
  AnalysisStatus,
  ApiError,
  ClimateScenarioRequestInput,
  CommunityAreaSummary,
  ExperienceInputRaw,
  FeedQuery,
  FeedResponse,
  ModerationItem,
  MyExperience,
  PublicExperience,
  ReportInput,
  ResolvedArea,
  ClimateScenarioResponse,
  Crop,
  DataSourceStatus,
  FieldInputRaw,
  FieldRecord,
  GeocodeResult,
  GapAnalysisRequestInput,
  GapAnalysisResponse,
  Health,
  ObservationsResponse,
  Region,
  RotationComparisonRequestInput,
  RotationComparisonResponse,
  SavedScenarioInput,
  SavedScenarioRecord,
  SessionInfo,
  UserPublic,
} from '@fieldverse/contracts';

/**
 * The browser talks ONLY to Express. It never calls the Python ML service directly.
 * VITE_API_BASE_URL is public configuration — never put secrets in VITE_ variables.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '/api/v1';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
  get demoFallbackAvailable() {
    return !!(this.details && typeof this.details === 'object' && (this.details as { demoFallbackAvailable?: boolean }).demoFallbackAvailable);
  }
}

let forceDemoMode = false;
export function setForceDemoMode(v: boolean) {
  forceDemoMode = v;
}

async function request<T>(method: string, path: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-FieldVerse-Client'] = '1';
  if (forceDemoMode) headers['X-Analysis-Mode'] = 'demo';
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the FieldVerse server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = (json as ApiError | null)?.error;
    throw new ApiRequestError(res.status, e?.code ?? 'INTERNAL_ERROR', e?.message ?? `Request failed (${res.status}).`, e?.details, e?.requestId);
  }
  return json as T;
}

export const api = {
  health: () => request<Health>('GET', '/health'),
  analysisStatus: () => request<AnalysisStatus>('GET', '/analysis/status'),
  dataSourcesStatus: () => request<DataSourceStatus>('GET', '/data-sources/status'),

  regions: () => request<{ regions: Region[] }>('GET', '/regions').then((r) => r.regions),
  region: (id: string) => request<{ region: Region }>('GET', `/regions/${encodeURIComponent(id)}`).then((r) => r.region),
  crops: () => request<{ crops: Crop[] }>('GET', '/crops').then((r) => r.crops),
  observations: (regionId: string) => request<ObservationsResponse>('GET', `/observations?regionId=${encodeURIComponent(regionId)}`),
  /** Live NASA POWER + SoilGrids for any location (coordinates are rounded to ~1 km by the server). */
  /** Village / town search (OpenStreetMap Nominatim via our server). */
  geocode: (q: string) => request<{ results: GeocodeResult[]; attribution: string }>('GET', `/geocode?q=${encodeURIComponent(q)}`),
  pointObservations: (lat: number, lon: number) => request<ObservationsResponse>('GET', `/observations/point?lat=${lat}&lon=${lon}`),

  compareRotations: (body: RotationComparisonRequestInput, signal?: AbortSignal) =>
    request<RotationComparisonResponse>('POST', '/rotations/compare', body, { signal }),
  analyzeScenario: (body: ClimateScenarioRequestInput, signal?: AbortSignal) =>
    request<ClimateScenarioResponse>('POST', '/rotations/scenario', body, { signal }),
  analyzeGaps: (body: GapAnalysisRequestInput, signal?: AbortSignal) => request<GapAnalysisResponse>('POST', '/gaps/analyze', body, { signal }),

  fields: () => request<{ fields: FieldRecord[] }>('GET', '/fields').then((r) => r.fields),
  createField: (body: FieldInputRaw) => request<{ field: FieldRecord }>('POST', '/fields', body).then((r) => r.field),
  updateField: (id: string, body: Partial<FieldInputRaw>) => request<{ field: FieldRecord }>('PATCH', `/fields/${id}`, body).then((r) => r.field),
  deleteField: (id: string) => request<void>('DELETE', `/fields/${id}`),

  scenarios: () => request<{ scenarios: SavedScenarioRecord[] }>('GET', '/scenarios').then((r) => r.scenarios),
  scenario: (id: string) => request<{ scenario: SavedScenarioRecord }>('GET', `/scenarios/${id}`).then((r) => r.scenario),
  saveScenario:(body: SavedScenarioInput) => request<{ scenario: SavedScenarioRecord }>('POST', '/scenarios', body).then((r) => r.scenario),
  deleteScenario: (id: string) => request<void>('DELETE', `/scenarios/${id}`),

  session: () => request<SessionInfo>('GET', '/auth/session'),
  register: (body: { name: string; email: string; password: string; language?: string }) => request<{ user: UserPublic }>('POST', '/auth/register', body),
  login: (body: { email: string; password: string }) => request<{ user: UserPublic }>('POST', '/auth/login', body),
  logout: () => request<void>('POST', '/auth/logout'),
  deleteAccount: (password: string) => request<void>('DELETE', '/auth/account', { password }),
};

/* ------------------------------ Community ------------------------------ */
const qs = (p: Record<string, string | number | undefined | null>) =>
  new URLSearchParams(Object.entries(p).filter(([, v]) => v != null && v !== '') as [string, string][]).toString();

export const communityApi = {
  feed: (p: Partial<FeedQuery>) => request<FeedResponse>('GET', `/community/experiences?${qs(p as Record<string, string>)}`),
  experience: (id: string) => request<{ experience: PublicExperience }>('GET', `/community/experiences/${encodeURIComponent(id)}`).then((r) => r.experience),
  related: (id: string) => request<{ items: PublicExperience[] }>('GET', `/community/experiences/${encodeURIComponent(id)}/related`).then((r) => r.items),
  areas: () => request<{ areas: CommunityAreaSummary[] }>('GET', '/community/locations').then((r) => r.areas),
  /** Sends the field location to OUR server only, which returns the coarse administrative area. */
  resolve: (lat: number, lon: number) => request<ResolvedArea>('GET', `/community/locations/resolve?${qs({ lat, lon })}`),
  mine: () => request<{ items: MyExperience[] }>('GET', '/community/my-experiences').then((r) => r.items),
  create: (body: ExperienceInputRaw) => request<{ experience: MyExperience }>('POST', '/community/experiences', body).then((r) => r.experience),
  update: (id: string, body: Partial<ExperienceInputRaw>) => request<{ experience: MyExperience }>('PATCH', `/community/experiences/${id}`, body).then((r) => r.experience),
  remove: (id: string) => request<void>('DELETE', `/community/experiences/${id}`),
  helpful: (id: string, on: boolean) => request<{ helpfulCount: number; viewerMarkedHelpful: boolean }>(on ? 'POST' : 'DELETE', `/community/experiences/${id}/helpful`),
  report: (id: string, body: ReportInput) => request<{ received: boolean }>('POST', `/community/experiences/${id}/report`, body),
  queue: () => request<{ items: ModerationItem[] }>('GET', '/community/moderation/queue').then((r) => r.items),
  moderate: (id: string, status: 'published' | 'hidden' | 'removed', message?: string) =>
    request<{ experience: MyExperience }>('PATCH', `/community/moderation/${id}`, { status, message: message || null }),
};
