import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const calls = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./calls" }),
  schema: z.object({
    number: z.number().optional(),
    description: z.string(),
    date: z.coerce.date(),
    time: z.string(),
    location: z.string(),
    joinLink: z.preprocess(
      (val) => (val === "" || val === null ? undefined : val),
      z.string().url().optional(),
    ),
    youtube: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{11}$/, {
        message:
          'YouTube field must be an 11-character video ID (e.g., "dQw4w9WgXcQ"), not a full URL',
      })
      .optional(),
    hosts: z.array(z.string()).optional(),
    greenRoom: z
      .object({
        time: z.string(),
        location: z.string(),
        joinLink: z.preprocess(
          (val) => (val === "" || val === null ? undefined : val),
          z.string().url().optional(),
        ),
      })
      .optional(),
    special: z.boolean().optional(),
  }),
});

export const collections = { calls };
