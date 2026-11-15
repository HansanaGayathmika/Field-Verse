import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';

// Also load the monorepo root .env when running from apps/api.
for (const candidate of [path.resolve(process.cwd(), '../../.env'), path.resolve(process.cwd(), '.env')]) {
  if (existsSync(candidate)) loadDotenv({ path: candidate, override: false });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().optional().default(''),
  ANALYSIS_PROVIDER: z.enum(['demo', 'remote']).default('demo'),
  ML_SERVICE_URL: z.string().url().optional().or(z.literal('')).default(''),
  ML_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  ML_SERVICE_API_KEY: z.string().optional().default(''),
  /** When true AND remote mode fails, the API reports `demoFallbackAvailable` so the UI can OFFER (not silently apply) demo mode. */
  ALLOW_DEMO_FALLBACK_OFFER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .enum(['true', 'false', 'auto'])
    .default('auto'),
  DEMO_DATA_DIR: z.string().optional().default(''),
  ENGINE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(6 * 60 * 60),
  GUEST_DATA_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Community: new and edited posts wait for a moderator before appearing publicly. */
  COMMUNITY_PREMODERATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Community: a published post is hidden for review after this many distinct open reports. */
  COMMUNITY_AUTO_HIDE_REPORTS: z.coerce.number().int().min(1).max(100).default(3),
  /** Fetch NASA POWER / SoilGrids live for custom (worldwide) locations. */
  LIVE_OBSERVATIONS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
export const cookieSecure = env.COOKIE_SECURE === 'auto' ? isProd : env.COOKIE_SECURE === 'true';
