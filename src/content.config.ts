import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const calls = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./calls" }),
  schema: z.object({
    number: z.number().optional(),
    description: z.string(),
    // Short one/two-sentence blurb for the videogen summary slide (written by
    // the /videogen skill). Distinct from the long-form `# AI Summary` body.
    summary: z.string().optional(),
    // Participants for the call-page roster + video. Names resolve against the
    // speaker registry (speakers/speakers.yaml) for avatars; auto-populated by
    // the /videogen skill from the transcript, then curated.
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
    // Seconds to add to every transcript YouTube deep-link, to account for the
    // intro/preroll the render prepends before the recording starts (the call's
    // displayed timestamps are on the recording timeline; the uploaded YouTube
    // video opens with the intro slides). Set this to the render's preroll
    // length (currently ~14.5s, so 15). Displayed timestamps are unchanged; only
    // the `&t=` of the YouTube links is shifted. Defaults to 0.
    youtubeOffset: z.number().optional(),
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
