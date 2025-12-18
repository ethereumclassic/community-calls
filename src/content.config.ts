import { defineCollection, z } from 'astro:content';
import { callsLoader } from './lib/callsLoader';

const calls = defineCollection({
  loader: callsLoader({ pattern: '**/*.md', base: './calls' }),
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
    offlineChat: z
      .object({
        time: z.string(),
        location: z.string(),
        link: z.string().url().optional(),
      })
      .optional(),
    special: z.boolean().optional(),
    // Computed fields (added by loader)
    callNumber: z.number().optional(),
    youtubeId: z.string().nullable().optional(),
    slug: z.string().optional(),
    uid: z.string().optional(),
  }),
});

export const collections = { calls };
