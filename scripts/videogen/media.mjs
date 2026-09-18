#!/usr/bin/env node
// Per-call media store on GitHub Releases: one release per call, tagged
// call-<NN>, holding the distributable audio (<NN>-audio.mp3) and one
// <NN>-assets.zip of the display media, with the YouTube and call-page links
// in the notes. Nothing else goes on the releases page.
//
//   node scripts/videogen/media.mjs push <NN>   # audio + zipped media -> release
//   node scripts/videogen/media.mjs pull <NN>   # release -> local paths
//   node scripts/videogen/media.mjs status <NN>
//
// Local layout the pipeline reads:
//   public/videogen/<NN>/<NN>-audio.mp3      distributable audio (gitignored)
//   .cache/videogen/<id>/media/<file>        display media (gitignored)
// Committed stills stay in calls/media/. Renders are never stored: YouTube
// has the published copy and the call reproduces from these plus the markdown.
//
// Uses the `gh` CLI for auth and the REST API (this box has no GraphQL), and
// curl for the asset upload to uploads.github.com.

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO =
  process.env.VIDEOGEN_MEDIA_REPO ?? "ethereumclassic/community-calls";

const [cmd, nnArg] = process.argv.slice(2);
if (!cmd || !nnArg || !["push", "pull", "status"].includes(cmd)) {
  console.error("usage: media.mjs push|pull|status <NN>");
  process.exit(2);
}
const nn = String(parseInt(nnArg, 10));
const nnn = nn.padStart(3, "0");

// Resolve the call id (<YYYYMMDD>_<NNN>) and its frontmatter from calls/.
const mdName = readdirSync(join(ROOT, "calls")).find((f) =>
  f.endsWith(`_${nnn}.md`),
);
if (!mdName) die(`no calls/*_${nnn}.md`);
const id = mdName.replace(/\.md$/, "");
const fm =
  parseYaml(
    /^---\n([\s\S]*?)\n---/.exec(
      readFileSync(join(ROOT, "calls", mdName), "utf8"),
    )?.[1] ?? "",
  ) ?? {};

const tag = `call-${nn}`;
const audioLocal = join(ROOT, "public/videogen", nn, `${nn}-audio.mp3`);
const mediaDir = join(ROOT, ".cache/videogen", id, "media");
const audioAsset = `${nn}-audio.mp3`;
const zipAsset = `${nn}-assets.zip`;

function die(msg) {
  console.error(`media: ${msg}`);
  process.exit(1);
}
function gh(args, input) {
  const r = spawnSync("gh", args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 << 20,
  });
  if (r.status !== 0)
    throw new Error(`gh ${args.join(" ")}: ${r.stderr.trim()}`);
  return r.stdout;
}
function api(method, path, body) {
  const args = ["api", "-X", method, path];
  if (body) args.push("--input", "-");
  return JSON.parse(
    gh(args, body ? JSON.stringify(body) : undefined) || "null",
  );
}
function getRelease() {
  try {
    return api("GET", `repos/${REPO}/releases/tags/${tag}`);
  } catch (e) {
    if (/404/.test(String(e))) return null;
    throw e;
  }
}
function releaseBody() {
  const lines = [];
  if (fm.youtube) lines.push(`**Video:** https://youtu.be/${fm.youtube}`);
  lines.push(`**Show notes:** https://cc.ethereumclassic.org/calls/${nn}`);
  lines.push("");
  lines.push(
    "Media for the call's video render: the distributable audio and the",
    "display clips (assets.zip). Fetch with `node scripts/videogen/media.mjs pull " +
      nn +
      "`.",
  );
  return lines.join("\n");
}
function fmt(bytes) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

async function push() {
  if (!existsSync(audioLocal)) die(`missing ${audioLocal}`);
  const mediaFiles = existsSync(mediaDir)
    ? readdirSync(mediaDir).filter((f) => !f.startsWith("."))
    : [];
  let zipPath = null;
  if (mediaFiles.length) {
    zipPath = join(ROOT, ".cache/videogen", id, zipAsset);
    rmSync(zipPath, { force: true });
    execFileSync("zip", [
      "-q",
      "-j",
      zipPath,
      ...mediaFiles.map((f) => join(mediaDir, f)),
    ]);
  }
  let rel = getRelease();
  const meta = {
    tag_name: tag,
    target_commitish: "main",
    name: `Call ${nn}: ${fm.description ?? ""}`.trim(),
    body: releaseBody(),
    draft: false,
    prerelease: false,
  };
  if (!rel) {
    rel = api("POST", `repos/${REPO}/releases`, meta);
    console.log(`▸ created release ${tag} (${rel.html_url})`);
  } else {
    rel = api("PATCH", `repos/${REPO}/releases/${rel.id}`, meta);
    console.log(`▸ updated release ${tag} (${rel.html_url})`);
  }
  const token = gh(["auth", "token"]).trim();
  const uploads = [[audioLocal, audioAsset, "audio/mpeg"]];
  if (zipPath) uploads.push([zipPath, zipAsset, "application/zip"]);
  for (const [file, name, type] of uploads) {
    const existing = (rel.assets ?? []).find((a) => a.name === name);
    if (existing) api("DELETE", `repos/${REPO}/releases/assets/${existing.id}`);
    const url = `https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`;
    const r = spawnSync(
      "curl",
      [
        "-sS",
        "-f",
        "-X",
        "POST",
        "-H",
        `Authorization: Bearer ${token}`,
        "-H",
        `Content-Type: ${type}`,
        "--data-binary",
        `@${file}`,
        url,
      ],
      { encoding: "utf8", maxBuffer: 64 << 20 },
    );
    if (r.status !== 0) die(`upload ${name} failed: ${r.stderr}`);
    console.log(`  ↑ ${name} (${fmt(statSync(file).size)})`);
  }
  if (zipPath) rmSync(zipPath, { force: true });
  console.log(`✓ ${tag}: ${uploads.length} asset(s)`);
}

function download(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const r = spawnSync("curl", ["-sS", "-f", "-L", "-o", dest, url], {
    encoding: "utf8",
  });
  if (r.status !== 0) die(`download ${url} failed: ${r.stderr}`);
}

async function pull() {
  const rel = getRelease();
  if (!rel) die(`no release ${tag} on ${REPO}`);
  const byName = Object.fromEntries((rel.assets ?? []).map((a) => [a.name, a]));
  const audio = byName[audioAsset];
  if (audio) {
    download(audio.browser_download_url, audioLocal);
    console.log(
      `  ↓ ${audioAsset} -> public/videogen/${nn}/ (${fmt(audio.size)})`,
    );
  } else console.log(`  (no ${audioAsset} on the release)`);
  const zip = byName[zipAsset];
  if (zip) {
    const tmp = join(ROOT, ".cache/videogen", id, zipAsset);
    download(zip.browser_download_url, tmp);
    mkdirSync(mediaDir, { recursive: true });
    execFileSync("unzip", ["-q", "-o", tmp, "-d", mediaDir]);
    rmSync(tmp, { force: true });
    console.log(
      `  ↓ ${zipAsset} -> .cache/videogen/${id}/media/ (${readdirSync(mediaDir).length} file(s))`,
    );
  } else console.log(`  (no ${zipAsset} on the release)`);
  console.log(`✓ ${tag} pulled`);
}

function status() {
  const rel = getRelease();
  console.log(
    `call ${nn} (${id}) release ${tag}: ${rel ? rel.html_url : "none"}`,
  );
  for (const a of rel?.assets ?? [])
    console.log(`  remote ${a.name} ${fmt(a.size)}`);
  console.log(
    `  local audio: ${existsSync(audioLocal) ? fmt(statSync(audioLocal).size) : "missing"}`,
  );
  const files = existsSync(mediaDir) ? readdirSync(mediaDir) : [];
  console.log(`  local media: ${files.length ? files.join(", ") : "none"}`);
}

if (cmd === "push") await push();
else if (cmd === "pull") await pull();
else status();
