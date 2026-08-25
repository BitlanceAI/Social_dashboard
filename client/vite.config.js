import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      proxy: {
        '/api/n8n': {
          target: env.VITE_N8N_WEBHOOK_URL || 'https://bitlancetechhub.app.n8n.cloud',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/n8n/, ''),
        },
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      // Enable minification (esbuild is the default — fast & effective)
      minify: 'esbuild',
      rollupOptions: {
        output: {
          // Fine-grained manual chunks: each heavy lib loads only when its route is visited
          manualChunks(id) {
            // React core — always needed
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'react-core';
            }
            if (id.includes('node_modules/react-router-dom/') || id.includes('node_modules/@remix-run/')) {
              return 'router';
            }
            if (id.includes('node_modules/framer-motion/')) {
              return 'motion';
            }
            if (id.includes('node_modules/@supabase/')) {
              return 'supabase';
            }
            // UI utilities — small, share across most routes
            if (id.includes('node_modules/lucide-react/')) {
              return 'icons';
            }
            if (id.includes('node_modules/react-hot-toast/') || id.includes('node_modules/react-helmet-async/')) {
              return 'ui-utils';
            }
          },
        },
      },
    },
  }
})

