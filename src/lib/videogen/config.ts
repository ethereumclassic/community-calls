// Common (non-episode-specific) videogen config. Episode data lives in the
// call markdown; this is the shared presentation/render config that every
// episode inherits. Speakers/avatars are resolved via speakers/speakers.yaml.

export const VIDEOGEN_CONFIG = {
  /**
   * Intro/outro jingle: the audiogen-composed take. It plays over the
   * pre/post-roll slides and crossfades under the speaker at the start/end of
   * the call (see JINGLE_OVERLAP_SEC in timeline.ts). Served from assets/ by
   * the dev-only `audiogen-dev-recording` Vite plugin (astro.config.mjs);
   * videogen rendering is itself dev-only, so this path is always available
   * when it runs. Re-record it in /audiogen.
   */
  intro: "/audiogen/recording.mp3",
  outro: "/audiogen/recording.mp3",
  /** Default render settings. */
  fps: 60,
  bands: 48,
  /** Base URL used to build per-episode show-notes links. */
  episodeBaseUrl: "cc.ethereumclassic.org/calls",
};
