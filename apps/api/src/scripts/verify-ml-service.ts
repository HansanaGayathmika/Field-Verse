/**
 * ML integration verification script — run by EITHER team against a running FastAPI service.
 *
 *   ML_SERVICE_URL=http://localhost:8000 npm run verify:ml
 *
 * Sends the example requests from packages/contracts/analysis/examples to the service via the
 * real HttpAnalysisAdapter and validates every response against the shared Zod contract.
 * Exit code 0 = compatible, 1 = incompatibilities found.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClimateScenarioRequestSchema,
  GapAnalysisRequestSchema,
  RotationComparisonRequestSchema,
} from '@fieldverse/contracts';
import { HttpAnalysisAdapter } from '../adapters/analysis/HttpAnalysisAdapter';

const url = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const examplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../packages/contracts/analysis/examples');
const load = (f: string) => JSON.parse(readFileSync(path.join(examplesDir, f), 'utf8'));

const adapter = new HttpAnalysisAdapter({ baseUrl: url, timeoutMs: Number(process.env.ML_SERVICE_TIMEOUT_MS ?? 30000) });
let failures = 0;

async function check(name: string, fn: () => Promise<unknown>, expect?: (r: any) => string | null) {
  process.stdout.write(`• ${name} … `);
  try {
    const r = await fn();
    const problem = expect?.(r) ?? null;
    if (problem) {
      failures++;
      console.log(`✗ ${problem}`);
    } else console.log('✓ contract OK');
  } catch (err: any) {
    failures++;
    console.log(`✗ ${err.code ?? 'ERROR'}: ${err.message}`);
    if (err.details?.issues) for (const i of err.details.issues) console.log(`    - ${i.path}: ${i.message}`);
  }
}

console.log(`Verifying ML service at ${url}\n`);
await check('GET /v1/model-info', () => adapter.getModelInfo(), (r) => (r.provider !== 'remote' ? 'provider must be "remote"' : null));
await check('POST /v1/rotations/compare', () => adapter.compareRotations(RotationComparisonRequestSchema.parse(load('rotation-comparison.request.json'))), (r) =>
  r.modelVersion ? null : 'modelVersion should identify the real model (got null)',
);
await check('POST /v1/scenarios/analyze', () => adapter.analyzeScenario(ClimateScenarioRequestSchema.parse(load('climate-scenario.request.json'))));
await check('POST /v1/gaps/analyze', () => adapter.analyzeGaps(GapAnalysisRequestSchema.parse(load('gap-analysis.request.json'))));
await check(
  'Error format for unsupported region',
  async () => {
    const req = RotationComparisonRequestSchema.parse({ ...load('rotation-comparison.request.json'), regionId: 'unsupported-region-xyz' });
    try {
      await adapter.compareRotations(req);
      return { unexpected: true };
    } catch (e: any) {
      return { code: e.code };
    }
  },
  (r) => (r.unexpected ? 'expected an error response for an unsupported region' : r.code === 'REGION_NOT_SUPPORTED' ? null : `expected REGION_NOT_SUPPORTED, got ${r.code}`),
);

console.log(failures ? `\n✗ ${failures} check(s) failed. See docs/ML_HANDOFF.md.` : '\n✓ The service is compatible with the FieldVerse contract.');
process.exit(failures ? 1 : 0);
