import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    outDir:    'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    chunkSizeWarningLimit: 2000,
  },

  server: {
    port: 5173,
    host: true,
  },

  preview: {
    port: 4173,
    host: true,
  },

  // mapbox-gl v3 bundles its own worker. Excluding it from Vite's pre-bundler
  // prevents the worker URL from being incorrectly resolved at build time.
  optimizeDeps: {
    exclude: ['mapbox-gl'],
  },
});
