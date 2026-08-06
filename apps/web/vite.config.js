import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const NAVY = '#1B2A4A';
const CREAM = '#FAF3E7';

const API_TARGET = process.env.KIOSK_API_TARGET || 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'placeholders/logo.svg'],
      manifest: {
        name: 'Sweet Gonz Bakeshop Café Kiosk',
        short_name: 'Sweet Gonz',
        description: 'Self-service ordering kiosk for Sweet Gonz Bakeshop Café (pilot)',
        lang: 'en',
        start_url: '/kiosk',
        scope: '/',
        display: 'standalone',
        orientation: 'landscape',
        background_color: CREAM,
        theme_color: NAVY,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/kiosk',
        navigateFallbackDenylist: [/^\/api/, /^\/admin/],
        runtimeCaching: [
          {
            // Latest successful public menu response (offline menu display).
            urlPattern: ({ url }) => url.pathname === '/api/v1/menu',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kiosk-menu',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Placeholder artwork.
            urlPattern: ({ url }) => url.pathname.startsWith('/placeholders/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kiosk-placeholders',
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // NEVER cache admin/session/order/receipt responses - handled by
        // only registering the whitelisted runtime routes above.
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
});
