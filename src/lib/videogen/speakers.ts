// Single source of truth for the speaker registry (speakers/speakers.yaml) and
// for resolving a transcript/roster name → its display name + served avatar URL.
// Used by the videogen endpoints and the call-page roster. The render driver
// reads the same YAML directly (it can't go through Vite).
//
// Avatar images live in public/speakers/ and are referenced by a plain
// /speakers/<file> URL. They must be a real public asset (not an
// import.meta.glob ?url): the transcript is built by the remark-webvtt plugin,
// which runs in Vite's config graph where ?url does NOT emit/hash an asset — it
// returns an unservable path that 404s in prod. A public/ file always ships.

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
