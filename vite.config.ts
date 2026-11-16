import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      VitePWA({
        injectRegister: false,
        includeAssets: ['sanas-wallet-192.png', 'sanas-wallet-512.png'],
        manifest: {
          id: './',
          name: "Sana's Wallet",
          short_name: "Sana's Wallet",
          description:
            'Mobile-first, offline-capable static personal expense and credit tracker PWA in Indian Rupees (₹) with monthly budget tracking and local browser storage.',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#ffffff',
          theme_color: '#059669',
          icons: [
            {
              src: 'sanas-wallet-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'sanas-wallet-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
