import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { SKILL_IDS } from './engine/skills';

const lessons = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    skill: z.enum(SKILL_IDS),
    summary: z.string(),
  }),
});

export const collections = { lessons };
