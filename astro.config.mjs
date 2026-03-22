import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import node from '@astrojs/node';

// Load .env variables into process.env so Node libraries (pg, etc.) can read them
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
Object.assign(process.env, env);

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    optimizeDeps: {
      exclude: ['pg', 'pg-pool'],
    },
    ssr: {
      noExternal: ['force-graph'],
      external: ['pg', 'pg-pool'],
    },
  },
});
