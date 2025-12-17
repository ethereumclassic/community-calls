import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const calls = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './calls' }),
  schema: z.object({
    title: z.string().optional(),
    name: z.string().optional(),
    number: z.number().optional(),
    tagline: z.string().optional(),
    description: z.string().optional(),
    date: z.coerce.date().optional(),
    dates: z.array(z.coerce.date()).optional(),
    time: z.string().optional(),
    location: z.string().optional(),
    link: z.string().url().optional(),
    length: z.string().optional(),
    youtube: z.string().url().optional(),
    host: z.string().optional(),
    cohost: z.string().optional(),
    guests: z.string().optional(),
    images: z.array(z.string()).optional(),
    offlineChat: z.object({
      time: z.string(),
      location: z.string(),
      link: z.string().url().optional(),
    }).optional(),
  }),
});

export const collections = { calls };
