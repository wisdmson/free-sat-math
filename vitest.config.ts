/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';
export default getViteConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'soak',
          include: ['tests/soak/**/*.test.ts'],
          environment: 'node',
          testTimeout: 600000,
        },
      },
    ],
  },
});
