import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

// Staff dashboard runs on its own port (5174) so it never clashes with the
// passenger PWA (5173). It talks to the SAME read-only backend on :5000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const devApiProxy = env.VITE_DEV_API_PROXY || 'http://localhost:5000';
  return ({
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      '/api': devApiProxy,
    },
  },
  });
});
