/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root for the whole project (see .env.example); only VITE_* values reach the browser.
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    // Dev proxy: the browser talks to Express only through /api (no CORS needed in dev).
    proxy: { '/api': { target: process.env.VITE_DEV_API_PROXY ?? 'http://localhost:5000', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: process.env.VITE_DEV_API_PROXY ?? 'http://localhost:5000', changeOrigin: false } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          charts: ['recharts'],
          map: ['leaflet', 'react-leaflet'],
          motion: ['motion'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Unit tests never depend on the local .env (e.g. a live recommendation engine).
    env: { VITE_RECOMMEND_MODE: 'mock' },
    css: false,
  },
});
