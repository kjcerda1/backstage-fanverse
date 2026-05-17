import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    outDir:    'dist',
    sourcemap: false,
    // Single chunk is fine for a prototype — avoids code-splitting complexity
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    // Warn but don't error on large bundle (App.jsx is intentionally large for now)
    chunkSizeWarningLimit: 2000,
  },

  server: {
    port: 5173,
    // Allow LAN access for real-device testing
    host: true,
  },

  preview: {
    port: 4173,
    host: true,
  },
});
