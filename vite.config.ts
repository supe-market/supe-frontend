import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': {
        target: 'https://auth.localhost',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/auth/, '')
      },
      '/analytics': {
        target: 'https://analytics.localhost',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/analytics/, '')
      }
    }
  }
});
