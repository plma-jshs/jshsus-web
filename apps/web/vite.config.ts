import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceOnlyImages = [
  'images/about-eagle.png',
  'images/auth-campus.png',
  'images/introduce/kang_jae_hwan.png',
  'images/introduce/kim_seong_chan.jpg',
];

export default defineConfig({
  envDir: false,
  plugins: [
    react(),
    {
      name: 'exclude-source-only-images',
      apply: 'build',
      closeBundle() {
        for (const image of sourceOnlyImages) {
          rmSync(resolve('dist', image), { force: true });
        }
      },
    },
  ],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    allowedHosts: ['auth.localhost'],
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
