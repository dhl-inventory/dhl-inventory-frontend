import path from 'path';
import { defineConfig } from 'vite';

// 로컬 dev 시 backend/socket.io 도달 가능하게 proxy.
// 운영(nginx 같은 origin)에서는 영향 없음 — Vite dev server 전용 설정.
const BACKEND_URL = process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:8000';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    proxy: {
      '/api/v1': {
        target: BACKEND_URL,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (_, req) => {
            console.log(`[proxy →] ${req.method} ${req.url}`);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(`[proxy ←] ${proxyRes.statusCode} ${req.method} ${req.url}`);
          });
          proxy.on('error', (err, req) => {
            console.log(`[proxy ✗] ${req.method} ${req.url} — ${err.message}`);
          });
        },
      },
      '/socket.io': {
        target: BACKEND_URL,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err, req) => {
            console.log(`[socket ✗] ${req.url} — ${err.message}`);
          });
        },
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        landing: path.resolve(__dirname, 'landing.html'),
      },
    },
  },
});
