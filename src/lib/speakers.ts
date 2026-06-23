// Single source of truth for the speaker registry (speakers/speakers.yaml) and
// for resolving a transcript/roster name → its display name + served avatar URL.
// Used by the call-page roster and the transcript renderer.
//
// Avatars live next to the YAML in /speakers/ (outside public/); Vite serves
// and hashes them via the import.meta.glob ?url below, so they ship correctly
// to prod.

import { parse as parseYaml } from "yaml";

type SpeakerRecord = {
  displayName: string;
  aliases?: string[];
  avatar?: string;
  github?: string;
};

type ResolvedSpeaker = {
  key: string;
  displayName: string;
  avatar: string | null;
  github?: string;
};

const rawYaml = Object.values(
  import.meta.glob("/speakers/speakers.yaml", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0] as string | undefined;

const REGISTRY: Record<string, SpeakerRecord> = rawYaml
  ? (parseYaml(rawYaml) ?? {})
  : {};

// filename ("istora.png") → served, hashed URL.
const AVATAR_URLS = import.meta.glob<string>(
  "/speakers/*.{png,webp,jpg,jpeg,svg}",
  { query: "?url", import: "default", eager: true },
);

function avatarUrl(rec: SpeakerRecord): string | null {
  if (rec.avatar && AVATAR_URLS[`/speakers/${rec.avatar}`]) {
    return AVATAR_URLS[`/speakers/${rec.avatar}`];
  }
  if (rec.github) return `https://github.com/${rec.github}.png?size=256`;
  return null;
}

// Match a name against a registry entry's key, displayName, or any alias
// (case-insensitive). Returns null for an unknown speaker (→ initials fallback).
export function resolveSpeaker(name: string): ResolvedSpeaker | null {
  const lower = name.trim().toLowerCase();
  for (const [key, rec] of Object.entries(REGISTRY)) {
    const names = [key, rec.displayName, ...(rec.aliases ?? [])].map((s) =>
      s.toLowerCase(),
    );
    if (names.includes(lower)) {
      return {
        key,
        displayName: rec.displayName,
        avatar: avatarUrl(rec),
        github: rec.github,
      };
    }
  }
  return null;
}
