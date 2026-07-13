import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envDir: false,
  plugins: [react()],
  server: {
    port: Number(process.env.ADMIN_PORT ?? 5174),
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
