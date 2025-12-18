import { defineCollection, z } from 'astro:content';
import { callsLoader } from './lib/callsLoader';

const calls = defineCollection({
  loader: callsLoader({ pattern: '**/*.md', base: './calls' }),
  schema: z.object({
    // Core fields
    number: z.number().optional(),
    description: z.string().optional(),
    date: z.coerce.date().optional(),
    time: z.string().optional(),
    location: z.string().optional(),
    joinLink: z.string().url().optional(),

    // Recording
    youtube: z.string().url().optional(),

    // Participants
    hosts: z.array(z.string()).optional(),

    // Pre-call hangout
    greenRoom: z
      .object({
        time: z.string(),
        location: z.string(),
        joinLink: z.string().url().optional(),
      })
      .optional(),

    // Special handling
    special: z.boolean().optional(),

    // Computed fields (added by loader)
    callNumber: z.number().optional(),
    youtubeId: z.string().nullable().optional(),
    slug: z.string().optional(),
    uid: z.string().optional(),
  }),
});

export const collections = { calls };
