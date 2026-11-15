import type {
  ClimateScenarioRequest,
  ClimateScenarioResponse,
  GapAnalysisRequest,
  GapAnalysisResponse,
  ModelInfo,
  RotationComparisonRequest,
  RotationComparisonResponse,
} from '@fieldverse/contracts';

/**
 * The ONE seam between FieldVerse and any analytical engine.
 *
 *  - DemoAnalysisAdapter  → prepared, clearly labelled demonstration fixtures (no ML).
 *  - HttpAnalysisAdapter  → the AI/ML team's Python FastAPI service.
 *
 * Express controllers and React pages depend only on this interface and on the
 * contract schemas in @fieldverse/contracts, so swapping providers needs no UI rewrite.
 *
 * Implementations MUST:
 *  - return objects that pass the response schemas in @fieldverse/contracts;
 *  - throw AnalysisError for unsupported inputs instead of fabricating results;
 *  - never present demo content as model inference.
 */
export interface AnalysisProvider {
  readonly mode: 'demo' | 'remote';
  getModelInfo(): Promise<ModelInfo>;
  compareRotations(request: RotationComparisonRequest): Promise<RotationComparisonResponse>;
  analyzeScenario(request: ClimateScenarioRequest): Promise<ClimateScenarioResponse>;
  analyzeGaps(request: GapAnalysisRequest): Promise<GapAnalysisResponse>;
}
