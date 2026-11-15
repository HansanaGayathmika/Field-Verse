/**
 * Local development MongoDB without installing MongoDB or Docker.
 * Starts a real mongod (downloaded once by mongodb-memory-server) on port 27017,
 * persisting data in <repo>/.mongo-data so it survives restarts.
 *   npm run db:memory
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Reuse the binary downloaded by mongodb-memory-server's postinstall (root node_modules cache).
process.env.MONGOMS_DOWNLOAD_DIR ??= path.resolve(process.cwd(), '../../node_modules/.cache/mongodb-memory-server');
const port = Number(process.env.MEMORY_DB_PORT ?? 27017);
const dbPath = path.resolve(process.cwd(), '../../.mongo-data');
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { port, dbPath, storageEngine: 'wiredTiger' },
});
console.log(`✓ Local MongoDB running at ${server.getUri()} (data: ${dbPath})`);
console.log('  Set MONGODB_URI=mongodb://127.0.0.1:%d/fieldverse in .env. Press Ctrl+C to stop.', port);

const stop = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30);
