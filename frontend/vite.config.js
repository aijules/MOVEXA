import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const devApiProxy = env.VITE_DEV_API_PROXY || 'http://localhost:5000';
  return ({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'manifest.webmanifest'],
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/stops/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'stops-cache', expiration: { maxAgeSeconds: 3600 } },
          },
          {
            urlPattern: /^https?:\/\/.*\/api\/lines/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'lines-cache', expiration: { maxAgeSeconds: 3600 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: devApiProxy, changeOrigin: true },
    },
  },
  });
});
