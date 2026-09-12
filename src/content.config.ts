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
    // One-line teaser of the agenda for the share snippet and X post, written
    // with the agenda (the /draft-agenda skill). Keep it to roughly 80
    // characters: ShareModal fails the build if the X post exceeds 280.
    agendaSummary: z.string().max(120).optional(),
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
    // Display-mode windows for the video: while the call discusses an asset,
    // the stage swaps the waveform for the asset (image or video), stacks the
    // roster to the left, and keeps subtitles/header/chapters in place. Times
    // are on the transcript clock ([h:]mm:ss[.ms], same as NOTE chapters);
    // `src` is relative to the call's media dir (./media/x.webp) or a URL.
    // Read by the videogen sidecar (src/lib/videogen/calls-server.ts).
    displays: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          src: z.string(),
          // Images: zoom from `zoomFrom` to `zoomTo` across the window (default
          // a slow 1 -> 1.06 drift), keeping `focus` ("x% y%" of the frame,
          // default centre) fixed on screen at the zoomed-in end.
          zoomFrom: z.number().positive().optional(),
          zoomTo: z.number().positive().optional(),
          focus: z.string().optional(),
          // Videos: playback rate (1 = natural) and whether to loop to fill
          // the window.
          rate: z.number().positive().optional(),
          loop: z.boolean().optional(),
        }),
      )
      .optional(),
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
