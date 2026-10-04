#!/usr/bin/env node
// Emit the end-of-pipeline handoff block for a finished call: the dev-server
// download URL for the rendered video, plus the title / summary / chapters /
// link to paste into YouTube after upload. Reuses the same chapter parsing as
// videogen-validate.mjs. Chapters are emitted YouTube-style (first line forced
// to 0:00, which YouTube requires).
//
// Usage: node scripts/videogen-handoff.mjs calls/<YYYYMMDD>_<NNN>.md [--port 4321]

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { youtubeText } from "./videogen/episode-text.mjs";

const argv = process.argv.slice(2);
const mdPath = argv.find((a) => !a.startsWith("--"));
const port = argv.includes("--port")
  ? argv[argv.indexOf("--port") + 1]
  : "4321";
if (!mdPath) {
  console.error("usage: videogen-handoff.mjs <call.md> [--port 4321]");
  process.exit(1);
}

const { fm, title, description } = youtubeText(readFileSync(mdPath, "utf8"));

// The finished render lives in the call's local cache and is served (with
// Range support) by the dev server's videogen-cache route; the same file is
// what /videogen/<NN>/review plays.
const callId = basename(mdPath).replace(/\.md$/, "");
console.log(
  [
    `video ready to download: http://localhost:${port}/videogen-cache/${callId}/render.mp4`,
    `review page: http://localhost:${port}/videogen/${fm.number}/review`,
    ``,
    title,
    ``,
    description,
    ``,
  ].join("\n"),
);
