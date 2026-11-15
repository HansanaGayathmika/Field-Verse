import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { createApp } from './app';
import { getAnalysisProvider } from './adapters/analysis';
import { referenceData } from './services/referenceData';
import { logger } from './utils/logger';

async function main() {
  // Fail fast on broken fixtures or provider misconfiguration.
  referenceData.reload();
  const provider = getAnalysisProvider();
  logger.info('Analysis provider selected', { provider: provider.mode, mlServiceUrl: provider.mode === 'remote' ? env.ML_SERVICE_URL : undefined });

  await connectDb();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`FieldVerse API listening on http://localhost:${env.PORT}/api/v1`, { env: env.NODE_ENV });
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    await disconnectDb().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
