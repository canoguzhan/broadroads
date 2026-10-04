import { defineConfig } from 'vite';

// In development the client runs on :5173 and proxies the API and WebSocket
// to the game server on :8080 (`npm run dev` starts both).
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
});
