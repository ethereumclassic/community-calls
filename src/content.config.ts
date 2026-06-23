import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const calls = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./calls" }),
  schema: z.object({
    number: z.number().optional(),
    description: z.string(),
    // Short one/two-sentence blurb summarizing the call. Distinct from the
    // long-form `# AI Summary` body.
    summary: z.string().optional(),
    // Participants for the call-page roster. Names resolve against the speaker
    // registry (speakers/speakers.yaml) for display names + avatars.
    roster: z.array(z.string()).optional(),
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
        time: z.string().optional(),
        location: z.string().optional(),
        joinLink: z.preprocess(
          (val) => (val === "" || val === null ? undefined : val),
          z.string().url().optional(),
        ),
        sameLocation: z.boolean().optional(),
      })
      .optional(),
    special: z.boolean().optional(),
  }),
});

export const collections = { calls };
