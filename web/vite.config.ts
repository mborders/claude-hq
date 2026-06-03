import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// In dev, the SPA runs on 5173 and proxies /api to the Fastify server (7878).
// In prod, the Fastify server serves the built SPA + /api on one port.
const API_PORT = process.env.API_PORT ?? '7878';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ccm/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 7341,
    strictPort: true,
    proxy: {
      '/api': {
        // 127.0.0.1 (not "localhost") so the proxy always hits the IPv4 dev API
        // and isn't shadowed by anything listening on IPv6 ::1 (e.g. a Docker
        // container publishing the same port).
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
