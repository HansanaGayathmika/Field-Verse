import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/seeds/seed.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace contracts package (it ships TypeScript sources).
  noExternal: ['@fieldverse/contracts'],
});
