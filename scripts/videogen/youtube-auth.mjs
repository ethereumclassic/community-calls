#!/usr/bin/env node
// One-time (per 7 days while the Google app stays in Testing) sign-in that lets
// scripts/videogen/youtube.mjs edit videos on the channel. Two steps, because
// the sign-in redirects the browser to a localhost URL that cannot reach this
// container:
//
//   node scripts/videogen/youtube-auth.mjs            # prints a Google link
//   node scripts/videogen/youtube-auth.mjs "<url>"    # paste the localhost URL
//                                                     # the browser ended on
//
// Reads the Desktop OAuth client from .cache/youtube/client_secret.json and
// writes YOUTUBE_REFRESH_TOKEN to .env (both gitignored). At the account
// chooser, pick the channel (a brand account shows under your name).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLIENT = join(ROOT, ".cache/youtube/client_secret.json");
const ENV = join(ROOT, ".env");
const REDIRECT = "http://localhost:8765";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

if (!existsSync(CLIENT)) {
  console.error(
    `missing ${CLIENT}: download the Desktop OAuth client JSON there`,
  );
  process.exit(1);
}
const raw = JSON.parse(readFileSync(CLIENT, "utf8"));
const { client_id, client_secret } = raw.installed ?? raw.web ?? {};
if (!client_id || !client_secret) {
  console.error(
    "client_secret.json has no installed/web client_id + client_secret",
  );
  process.exit(1);
}

const pasted = process.argv[2];
if (!pasted) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
  }).toString();
  console.log(
    `Open this link, choose the channel's account, and approve:\n\n${url}\n`,
  );
  console.log(
    `Google then sends the browser to ${REDIRECT}/?code=... (the page will not load).\n` +
      `Copy that whole address and run:\n\n  node scripts/videogen/youtube-auth.mjs "<that address>"\n`,
  );
  process.exit(0);
}

const code = (() => {
  try {
    return new URL(pasted).searchParams.get("code");
  } catch {
    return pasted; // the bare code also works
  }
})();
if (!code) {
  console.error(
    "no ?code= in that address; copy the full URL the browser ended on",
  );
  process.exit(1);
}

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id,
    client_secret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  }),
});
const tok = await res.json();
if (!res.ok || !tok.refresh_token) {
  console.error(
    "token exchange failed:",
    tok.error_description ?? tok.error ?? tok,
  );
  process.exit(1);
}

// Which channel did this sign-in pick?
const ch = await (
  await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${tok.access_token}` } },
  )
).json();
const name = ch.items?.[0]?.snippet?.title ?? "(no channel)";

let env = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
env = env.replace(/^YOUTUBE_REFRESH_TOKEN=.*\n?/m, "");
if (env && !env.endsWith("\n")) env += "\n";
writeFileSync(ENV, `${env}YOUTUBE_REFRESH_TOKEN=${tok.refresh_token}\n`);
console.log(`Signed in as channel "${name}". Refresh token saved to .env.`);
