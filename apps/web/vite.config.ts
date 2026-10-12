import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Dev/preview backend (Fastify + Socket.IO); same origin in production.
 * Override with `HOMI_API_TARGET=http://localhost:3001 npm run dev -w @homi/web`.
 */
const API_TARGET = process.env.HOMI_API_TARGET ?? 'http://localhost:3000';

/**
 * Keep the browser's Host/Origin untouched (`changeOrigin: false`) so the server's CSRF
 * origin check sees the real app origin (APP_URL = http://localhost:5173 in dev).
 */
const proxy: Record<string, ProxyOptions> = {
  '/api': { target: API_TARGET, changeOrigin: false },
  '/socket.io': { target: API_TARGET, changeOrigin: false, ws: true },
};

const LIGHT_BACKGROUND = '#F7F6F3';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      // Registration happens in src/pwa/usePwaUpdate.ts via `virtual:pwa-register/react`.
      injectRegister: false,
      // Icons, favicons and theme-boot.js are matched by `workbox.globPatterns` (no duplicate entries).
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'Homi',
        short_name: 'Homi',
        description: 'Homi – Inventar, Einkaufsliste und Chat für deinen Haushalt. Gemeinsam organisiert.',
        lang: 'de-CH',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: LIGHT_BACKGROUND,
        theme_color: LIGHT_BACKGROUND,
        categories: ['lifestyle', 'productivity', 'utilities'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: hashed JS/CSS, HTML, icons and the Latin font subsets (the plugin adds the manifest).
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', 'assets/inter-latin-*.woff2'],
        // Source image of the icon generator – not needed at runtime.
        globIgnores: ['app-icon.svg'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // `registerType: 'prompt'` → the new worker waits until the user taps "Aktualisieren".
        skipWaiting: false,
        runtimeCaching: [
          {
            // Never cache API responses (private, per-user data).
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/socket.io/'),
            handler: 'NetworkOnly',
          },
          {
            // Non-Latin Inter subsets are fetched on demand and kept.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/inter-.*\.woff2$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'homi-fonts',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Stable vendor chunks: app deployments do not invalidate cached framework code.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor-router', test: /[\\/]node_modules[\\/]react-router[\\/]/ },
            { name: 'vendor-query', test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
            {
              name: 'vendor-motion',
              test: /[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/,
            },
            {
              name: 'vendor-socket',
              test: /[\\/]node_modules[\\/](socket\.io-client|socket\.io-parser|engine\.io-client|engine\.io-parser|@socket\.io)[\\/]/,
            },
            { name: 'vendor-zod', test: /[\\/]node_modules[\\/]zod[\\/]/ },
          ],
        },
      },
    },
  },
});
