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
      name: 'google-analytics-head-tag',
      transformIndexHtml(html) {
        const measurementId = (process.env.VITE_GA_MEASUREMENT_ID ?? '').trim();
        if (!measurementId || html.includes('data-jshsus-google-tag')) return html;

        const safeMeasurementId = JSON.stringify(measurementId);
        const snippet = `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}" data-jshsus-google-tag></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.gtag = window.gtag || gtag;
      gtag('js', new Date());
      gtag('config', ${safeMeasurementId}, { send_page_view: false });
      window.__jshsusGoogleTagConfigured = ${safeMeasurementId};
    </script>`;

        return html.replace('<head>', `<head>${snippet}`);
      },
    },
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
