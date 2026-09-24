import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

// SITE_URL and BASE_PATH are set by the deploy workflow (e.g. https://you.github.io and /sat-math).
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'always',
  integrations: [react(), mdx()],
});
