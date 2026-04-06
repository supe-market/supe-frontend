import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) {
            return 'vendor-antd';
          }
          if (id.includes('echarts') || id.includes('chart.js') || id.includes('recharts') || id.includes('d3')) {
            return 'vendor-charts';
          }
          // Keep React + everything it pulls in (scheduler, react-dom, react-router)
          // in a single chunk to avoid circular vendor splits.
          return 'vendor';
        }
      }
    }
  },
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
