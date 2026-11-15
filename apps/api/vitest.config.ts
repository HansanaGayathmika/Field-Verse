import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Reuse the mongod binary that mongodb-memory-server's postinstall put in the root node_modules cache.
const MONGOMS_DOWNLOAD_DIR = process.env.MONGOMS_DOWNLOAD_DIR ?? path.resolve(__dirname, '../../node_modules/.cache/mongodb-memory-server');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: { NODE_ENV: 'test', ANALYSIS_PROVIDER: 'demo', MONGODB_URI: '', LOG_LEVEL: 'error', MONGOMS_DOWNLOAD_DIR },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
