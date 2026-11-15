/**
 * Regenerates the example RESPONSE fixtures in packages/contracts/analysis/examples by running
 * the example requests through the DemoAnalysisAdapter. Guarantees the examples are schema-valid.
 *   npm run examples -w @fieldverse/api
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClimateScenarioRequestSchema, GapAnalysisRequestSchema, RotationComparisonRequestSchema } from '@fieldverse/contracts';
import { DemoAnalysisAdapter } from '../adapters/analysis/DemoAnalysisAdapter';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../packages/contracts/analysis/examples');
const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
const write = (f: string, v: unknown) => writeFileSync(path.join(dir, f), JSON.stringify(v, null, 2) + '\n');
const demo = new DemoAnalysisAdapter();

write('model-info.demo.response.json', await demo.getModelInfo());
write('rotation-comparison.demo.response.json', await demo.compareRotations(RotationComparisonRequestSchema.parse(read('rotation-comparison.request.json'))));
write('climate-scenario.demo.response.json', await demo.analyzeScenario(ClimateScenarioRequestSchema.parse(read('climate-scenario.request.json'))));
write('gap-analysis.demo.response.json', await demo.analyzeGaps(GapAnalysisRequestSchema.parse(read('gap-analysis.request.json'))));
write('error.scenario-not-supported.json', {
  error: {
    code: 'SCENARIO_NOT_SUPPORTED',
    message: 'Rainfall -10% / temperature +0.5 °C is not supported by this provider.',
    details: { supportedPresets: (await demo.getModelInfo()).scenarioPresets },
  },
});
console.log('✓ Example responses written to', dir);
