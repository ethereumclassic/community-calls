#!/usr/bin/env node
// Fill in a call's YouTube video: you upload the render in YouTube Studio
// (private), this sets everything else. It never makes a video public.
//
//   node scripts/videogen/youtube.mjs <NN> --dry-run      # show what it would do
//   node scripts/videogen/youtube.mjs <NN>                # do it
//     [--upload]              upload .cache/videogen/<id>/render.mp4 itself, as
//                             private (see the audit note below)
//     [--video <id|url>]      the upload (default: the recent private upload
//                             whose length matches .cache/videogen/<id>/render.mp4)
//     [--no-link]             don't write the video id into the call markdown
//     [--playlist <id|url>]   also add it to this playlist
//     [--thumbnail <file>]    also set this custom thumbnail (png/jpg, <2 MB)
//
// Sets: title, description (summary, chapters, links, call page; the same text
// videogen-handoff.mjs prints), category, tags, language; uploads English
// captions from the call's cleaned transcript on the video clock; writes
// `youtube: <id>` into the call's frontmatter.
//
// Audit note: Google documents that videos uploaded through the API (--upload)
// by a project that has not passed YouTube's API audit are restricted to
// private. That did not apply here: Call 61 was uploaded with --upload and
// later set public (Oct 2026). If it ever does, upload in Studio and run this
// without --upload (editing is never locked).

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCallMarkdown, youtubeText } from "./episode-text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const CAPTION_NAME = "Transcript";
const CATEGORY_SCIENCE_TECH = "28";
const TAGS = [
  "Ethereum Classic",
  "ETC",
  "ETC Community Call",
  "blockchain",
  "proof of work",
];

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const doUpload = args.includes("--upload");
const noLink = args.includes("--no-link");
const nnArg = args.find((a) => /^\d+$/.test(a));
if (!nnArg) {
  console.error(
    "usage: youtube.mjs <NN> [--dry-run] [--video <id>] [--playlist <id>] [--thumbnail <file>]",
  );
  process.exit(2);
}
const nn = String(parseInt(nnArg, 10));
const idFrom = (s, key) => {
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return (
      u.searchParams.get(key) ??
      (u.hostname === "youtu.be" ? u.pathname.slice(1) : undefined) ??
      u.pathname.split("/").pop()
    );
  } catch {
    return s;
  }
};
const videoArg = idFrom(opt("video"), "v");
const playlistArg = idFrom(opt("playlist"), "list");
const thumbArg = opt("thumbnail");

// ── the call ─────────────────────────────────────────────────────────────────
const mdName = readdirSync(join(ROOT, "calls")).find((f) =>
  f.endsWith(`_${nn.padStart(3, "0")}.md`),
);
if (!mdName) die(`no calls/*_${nn.padStart(3, "0")}.md`);
const id = mdName.replace(/\.md$/, "");
const mdPath = join(ROOT, "calls", mdName);
const md = readFileSync(mdPath, "utf8");
const { fm, title, description } = youtubeText(md);
if (title.length > 100) die(`title is ${title.length} chars (YouTube max 100)`);
if (description.length > 5000)
  die(`description is ${description.length} chars (YouTube max 5000)`);

// Video clock: the render's own timings, else the frontmatter offset.
const timingsFile = join(ROOT, ".cache/videogen", id, "render.timings.json");
const timings = existsSync(timingsFile)
  ? JSON.parse(readFileSync(timingsFile, "utf8"))
  : null;
const captionShift = timings
  ? timings.prerollSec - (timings.mainAudioOffsetSec ?? 0)
  : Number(fm.youtubeOffset ?? 0);
const renderPath = join(ROOT, ".cache/videogen", id, "render.mp4");
const renderSec = existsSync(renderPath) ? probeDuration(renderPath) : null;

// ── auth ─────────────────────────────────────────────────────────────────────
const client = JSON.parse(
  readFileSync(join(ROOT, ".cache/youtube/client_secret.json"), "utf8"),
);
const { client_id, client_secret } = client.installed ?? client.web ?? {};
const refresh = readEnv("YOUTUBE_REFRESH_TOKEN");
if (!refresh) die("no YOUTUBE_REFRESH_TOKEN in .env: run youtube-auth.mjs");
const tokRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id,
    client_secret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  }),
});
const tok = await tokRes.json();
if (!tokRes.ok)
  die(
    tok.error === "invalid_grant"
      ? "sign-in expired (Testing apps last 7 days): run youtube-auth.mjs again"
      : `token refresh failed: ${tok.error_description ?? tok.error}`,
  );
const auth = { Authorization: `Bearer ${tok.access_token}` };

// ── find the video ───────────────────────────────────────────────────────────
const channel = (
  await api("GET", "/channels?part=snippet,contentDetails&mine=true")
).items?.[0];
if (!channel) die("this sign-in has no YouTube channel");
console.log(`channel: ${channel.snippet.title}`);

let video;
if (doUpload) {
  if (renderSec == null) die(`no render at ${renderPath}`);
  console.log(`upload:  ${renderPath} (${fmtClock(renderSec)}), as private`);
} else if (videoArg) {
  video = (
    await api(
      "GET",
      `/videos?part=snippet,status,contentDetails&id=${videoArg}`,
    )
  ).items?.[0];
  if (!video) die(`no video ${videoArg} on this channel`);
} else {
  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  const items =
    (
      await api(
        "GET",
        `/playlistItems?part=contentDetails&maxResults=25&playlistId=${uploads}`,
      )
    ).items ?? [];
  const ids = items.map((i) => i.contentDetails.videoId).join(",");
  const vids = ids
    ? ((
        await api("GET", `/videos?part=snippet,status,contentDetails&id=${ids}`)
      ).items ?? [])
    : [];
  const priv = vids.filter((v) => v.status.privacyStatus === "private");
  const byLength =
    renderSec != null
      ? priv.filter(
          (v) =>
            Math.abs(isoSeconds(v.contentDetails.duration) - renderSec) <= 3,
        )
      : [];
  if (byLength.length === 1) video = byLength[0];
  else {
    console.error(
      `can't tell which upload is call ${nn}` +
        (renderSec != null ? ` (render is ${fmtClock(renderSec)})` : "") +
        "; recent private uploads:",
    );
    for (const v of priv)
      console.error(
        `  ${v.id}  ${fmtClock(isoSeconds(v.contentDetails.duration))}  ${v.snippet.title}`,
      );
    die("pass --video <id> (a just-uploaded video may still be processing)");
  }
}
if (video) {
  const vlen = isoSeconds(video.contentDetails.duration);
  console.log(
    `video:   ${video.id}  "${video.snippet.title}"  ${fmtClock(vlen)}  ${video.status.privacyStatus}`,
  );
  if (renderSec != null && vlen > 0 && Math.abs(vlen - renderSec) > 3)
    console.warn(
      `warning: video is ${fmtClock(vlen)} but the render is ${fmtClock(renderSec)}`,
    );
  if (video.status.privacyStatus !== "private")
    console.warn(
      `note: video is ${video.status.privacyStatus}; this script leaves privacy as it is`,
    );
}

// ── captions on the video clock ──────────────────────────────────────────────
const captions = buildCaptions(parseCallMarkdown(md).vtt, captionShift);

console.log(
  `\ntitle:\n  ${title}\n\ndescription:\n${description.replace(/^/gm, "  ")}\n`,
);
console.log(
  `captions: ${captions.count} cues, shifted +${captionShift.toFixed(2)}s onto the video clock`,
);
if (playlistArg) console.log(`playlist: ${playlistArg}`);
if (thumbArg) console.log(`thumbnail: ${thumbArg}`);
if (dryRun) {
  console.log("\n--dry-run: nothing changed");
  process.exit(0);
}

// ── apply ────────────────────────────────────────────────────────────────────
const snippet = {
  title,
  description,
  categoryId: CATEGORY_SCIENCE_TECH,
  tags: TAGS,
  defaultLanguage: "en",
  defaultAudioLanguage: "en",
};
if (doUpload) {
  video = await uploadVideo(renderPath, {
    snippet,
    status: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: false,
      embeddable: true,
    },
  });
  console.log(
    `✓ uploaded ${video.id} (private), with title, description, category, tags`,
  );
} else {
  await api("PUT", "/videos?part=snippet,status", {
    id: video.id,
    snippet,
    status: {
      privacyStatus: video.status.privacyStatus,
      selfDeclaredMadeForKids: false,
      embeddable: true,
    },
  });
  console.log("✓ title, description, category, tags");
}

const existing = (
  await api("GET", `/captions?part=snippet&videoId=${video.id}`)
).items?.find(
  (c) => c.snippet.name === CAPTION_NAME && c.snippet.language === "en",
);
await multipart(
  existing ? "PUT" : "POST",
  `/captions?part=snippet`,
  existing
    ? { id: existing.id, snippet: { isDraft: false } }
    : {
        snippet: {
          videoId: video.id,
          language: "en",
          name: CAPTION_NAME,
          isDraft: false,
        },
      },
  "text/vtt",
  Buffer.from(captions.vtt),
);
console.log(`✓ captions (${existing ? "replaced" : "added"})`);

if (playlistArg) {
  const inList = (
    await api(
      "GET",
      `/playlistItems?part=id&playlistId=${playlistArg}&videoId=${video.id}`,
    )
  ).items?.length;
  if (!inList)
    await api("POST", "/playlistItems?part=snippet", {
      snippet: {
        playlistId: playlistArg,
        resourceId: { kind: "youtube#video", videoId: video.id },
      },
    });
  console.log(`✓ playlist${inList ? " (already in it)" : ""}`);
}

if (thumbArg) {
  const img = readFileSync(thumbArg);
  if (img.length > 2 * 1024 * 1024) die("thumbnail is over 2 MB");
  const res = await fetch(`${UPLOAD}/thumbnails/set?videoId=${video.id}`, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": /\.jpe?g$/i.test(thumbArg) ? "image/jpeg" : "image/png",
    },
    body: img,
  });
  if (!res.ok) die(`thumbnail: ${await res.text()}`);
  console.log("✓ thumbnail");
}

// The call page links transcript timestamps into the video.
if (!noLink && fm.youtube !== video.id) {
  const updated = /^youtube:.*$/m.test(md)
    ? md.replace(/^youtube:.*$/m, `youtube: ${video.id}`)
    : md.replace(/^(description:.*)$/m, `$1\nyoutube: ${video.id}`);
  writeFileSync(mdPath, updated);
  console.log(`✓ calls/${mdName}: youtube: ${video.id}`);
}
console.log(
  `\nhttps://studio.youtube.com/video/${video.id}/edit  (still ${video.status.privacyStatus})`,
);

// ── helpers ──────────────────────────────────────────────────────────────────
// Resumable upload (videos.insert) in 64 MB chunks; a dropped chunk is
// re-asked for where the server says it got to, so a flaky link resumes
// rather than restarting the whole file.
async function uploadVideo(file, meta) {
  const { openSync, readSync, closeSync, statSync } = await import("node:fs");
  const size = statSync(file).size;
  const init = await fetch(
    `${UPLOAD}/videos?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        ...auth,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify(meta),
    },
  );
  if (!init.ok) die(`upload start: ${init.status} ${await init.text()}`);
  const session = init.headers.get("location");
  const CHUNK = 64 * 1024 * 1024;
  const fd = openSync(file, "r");
  let sent = 0;
  let tries = 0;
  try {
    while (true) {
      const len = Math.min(CHUNK, size - sent);
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, sent);
      let res;
      try {
        res = await fetch(session, {
          method: "PUT",
          headers: {
            "Content-Length": String(len),
            "Content-Range": `bytes ${sent}-${sent + len - 1}/${size}`,
          },
          body: buf,
        });
      } catch (e) {
        res = null;
        if (++tries > 5) die(`upload failed: ${e.message}`);
      }
      if (res && (res.status === 200 || res.status === 201)) {
        process.stdout.write(
          `\r  ${(size / 1e6).toFixed(0)} / ${(size / 1e6).toFixed(0)} MB  100%\n`,
        );
        return await res.json();
      }
      if (res && res.status !== 308 && res.status < 500)
        die(`upload: ${res.status} ${await res.text()}`);
      // 308 (or a retryable failure): ask where the server got to.
      const probe = await fetch(session, {
        method: "PUT",
        headers: { "Content-Length": "0", "Content-Range": `bytes */${size}` },
      });
      if (probe.status === 200 || probe.status === 201)
        return await probe.json();
      const range = probe.headers.get("range");
      sent = range ? Number(range.split("-")[1]) + 1 : 0;
      if (res && res.status === 308) tries = 0;
      process.stdout.write(
        `\r  ${(sent / 1e6).toFixed(0)} / ${(size / 1e6).toFixed(0)} MB  ${((sent / size) * 100).toFixed(0)}%`,
      );
    }
  } finally {
    closeSync(fd);
  }
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) die(`${method} ${path.split("?")[0]}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function multipart(method, path, meta, type, data) {
  const boundary = `videogen${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${UPLOAD}${path}${sep}uploadType=multipart`, {
    method,
    headers: {
      ...auth,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok)
    die(`${method} ${path.split("?")[0]}: ${res.status} ${await res.text()}`);
}

// The cleaned transcript as a WebVTT caption track on the video clock. The
// speaker's name leads a cue only when the speaker changes.
function buildCaptions(vtt, shift) {
  const toSec = (t) => {
    const p = t.split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  };
  const out = ["WEBVTT", ""];
  let prev = null;
  let n = 0;
  for (const block of vtt.split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti]
      .split("-->")
      .map((x) => toSec(x.trim().split(/\s+/)[0]));
    const text = lines
      .slice(ti + 1)
      .join(" ")
      .trim();
    const m = /^(@?\p{L}[\p{L}\p{N}_ .'-]{0,40}):\s+([\s\S]+)$/u.exec(text);
    const speaker = m?.[1];
    const words = m ? m[2] : text;
    const shown = speaker && speaker !== prev ? `${speaker}: ${words}` : words;
    prev = speaker ?? prev;
    n++;
    out.push(`${vttTime(a + shift)} --> ${vttTime(b + shift)}`, shown, "");
  }
  return { vtt: out.join("\n"), count: n };
}

function vttTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
}

function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d ?? "");
  return m
    ? (+m[1] || 0) * 86400 +
        (+m[2] || 0) * 3600 +
        (+m[3] || 0) * 60 +
        (+m[4] || 0)
    : 0;
}

function fmtClock(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function probeDuration(file) {
  const ff = createRequire(import.meta.url)("ffmpeg-static");
  const err = spawnSync(ff, ["-i", file], { encoding: "utf8" }).stderr;
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(err);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

function readEnv(key) {
  if (process.env[key]) return process.env[key];
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return undefined;
  return new RegExp(`^${key}=(.*)$`, "m")
    .exec(readFileSync(file, "utf8"))?.[1]
    ?.trim();
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}
