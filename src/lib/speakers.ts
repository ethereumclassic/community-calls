// Single source of truth for the speaker registry (speakers/speakers.yaml) and
// for resolving a transcript/roster name → its display name + served avatar URL.
// Used by the call-page roster and the transcript renderer.
//
// Avatars are served from public/speakers/ (shipped verbatim to the site root),
// so an avatar's URL is just its public path. This must work both in the Astro
// component graph (CallRoster) and in the config-context Vite graph where the
// remark transcript plugin runs — a plain public path resolves identically in
// both, unlike import.meta.glob('?url'), which only emits assets in the former.

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

// A bare filename in the registry ("istora.png") maps to the public path
// /speakers/istora.png (the file lives in public/speakers/).
function avatarUrl(rec: SpeakerRecord): string | null {
  if (rec.avatar) return `/speakers/${rec.avatar}`;
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
