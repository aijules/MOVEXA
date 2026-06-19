import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Staff dashboard runs on its own port (5174) so it never clashes with the
// passenger PWA (5173). It talks to the SAME read-only backend on :5000.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
