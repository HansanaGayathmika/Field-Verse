/**
 * Exports the analysis contract as JSON Schema (draft-07) so the AI/ML team can
 * generate Pydantic models (e.g. with `datamodel-code-generator`) or validate in Python.
 *   npm run contracts:jsonschema
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  AnalysisErrorBodySchema,
  ClimateScenarioRequestSchema,
  ClimateScenarioResponseSchema,
  GapAnalysisRequestSchema,
  GapAnalysisResponseSchema,
  ModelInfoSchema,
  RotationComparisonRequestSchema,
  RotationComparisonResponseSchema,
} from '../index';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../analysis/json-schema');
mkdirSync(out, { recursive: true });

const schemas = {
  'rotation-comparison.request': RotationComparisonRequestSchema,
  'rotation-comparison.response': RotationComparisonResponseSchema,
  'climate-scenario.request': ClimateScenarioRequestSchema,
  'climate-scenario.response': ClimateScenarioResponseSchema,
  'gap-analysis.request': GapAnalysisRequestSchema,
  'gap-analysis.response': GapAnalysisResponseSchema,
  'model-info.response': ModelInfoSchema,
  'error.response': AnalysisErrorBodySchema,
};

for (const [name, schema] of Object.entries(schemas)) {
  const json = zodToJsonSchema(schema, { name, target: 'jsonSchema7', $refStrategy: 'none' });
  writeFileSync(path.join(out, `${name}.schema.json`), JSON.stringify(json, null, 2) + '\n');
  console.log(`✓ ${name}.schema.json`);
}
