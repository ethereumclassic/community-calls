// @ts-check
import { rm, readdir } from "node:fs/promises";
import {
  createReadStream,
  existsSync,
  statSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import react from "@astrojs/react";
import rehypeExternalLinks from "rehype-external-links";
import remarkWebVtt from "./src/plugins/remark-webvtt.js";

// Dev-only routes that exist purely for local iteration and must never reach
// production. Each is gated at runtime (`if (!import.meta.env.DEV) redirect`)
// AND physically stripped from dist/ by the integration below, so a stray
// `astro build` can't ship them.
const DEV_ROUTES = [
  // route base name, plus any extra top-level dirs/files it owns and the
  // vendor chunks it (and only it) pulls into _astro/.
  {
    name: "videogen",
    extraDirs: ["videogen-sample"],
    vendors: ["audiomotion-analyzer"],
  },
  // audiogen loads Strudel from a CDN (external URL), so it produces no vendor
  // chunk of its own; only its page chunk needs stripping.
  { name: "audiogen" },
];

// Strips the dev-only routes (page chunks, html, sample assets, and their
// exclusive vendor chunks) from the build output so none of it reaches prod.
/** @type {import('astro').AstroIntegration} */
const stripDevRoutes = {
  name: "strip-dev-routes",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      // Derive everything a route owns from the single DEV_ROUTES table in one
      // pass, so the route name isn't iterated/re-listed twice:
      //   - topLevel: outputs at the build root — the route dir (directory
      //     build format), its .html (file build format), and any extra dirs.
      //   - chunkTokens: _astro chunk name-tokens — the route's own page chunk
      //     plus the vendor chunks it alone pulls in (vendor chunks are named
      //     after the package, not the route, so they're listed per route).
      const topLevel = [];
      const chunkTokens = [];
      for (const r of DEV_ROUTES) {
        topLevel.push(r.name, `${r.name}.html`, ...(r.extraDirs ?? []));
        chunkTokens.push(r.name, ...(r.vendors ?? []));
      }
      await Promise.all(
        topLevel.map((t) =>
          rm(new URL(`./${t}`, dir), { recursive: true, force: true }),
        ),
      );
      const astroDir = new URL("./_astro/", dir);
      try {
        const entries = await readdir(astroDir);
        // Escape regex metacharacters and require word boundaries so a token
        // like "audiogen" matches the dev chunk "audiogen.<hash>.js" but NOT an
        // unrelated prod chunk that merely contains the substring (e.g.
        // "audioGenerator.<hash>.js").
        const escapeRe = (/** @type {string} */ s) =>
          s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const devOnly = new RegExp(
          `\\b(${chunkTokens.map(escapeRe).join("|")})\\b`,
          "i",
        );
        await Promise.all(
          entries
            .filter((e) => devOnly.test(e))
            .map((e) =>
              rm(new URL(`./${e}`, astroDir), { recursive: true, force: true }),
            ),
        );
      } catch {
        // _astro/ may not exist for non-static builds
      }
    },
  },
};

// Serve one local file with HTTP Range support (so <audio>/<video> can seek)
// for the dev-only plugins below.
/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {URL|string} file @param {string} type */
function serveFileWithRange(req, res, file, type) {
  const size = statSync(file).size;
  res.setHeader("content-type", type);
  res.setHeader("accept-ranges", "bytes");
  res.setHeader("cache-control", "no-cache");
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (m) {
    const start = m[1]
      ? parseInt(m[1], 10)
      : Math.max(0, size - parseInt(m[2], 10));
    const end = Math.min(
      m[2] && m[1] ? parseInt(m[2], 10) : size - 1,
      size - 1,
    );
    if (start > end || start >= size) {
      res.statusCode = 416;
      res.setHeader("content-range", `bytes */${size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader("content-range", `bytes ${start}-${end}/${size}`);
    res.setHeader("content-length", end - start + 1);
    if (req.method === "HEAD") return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.setHeader("content-length", size);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

/** @type {Record<string, string>} */
const MEDIA_TYPES = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  vtt: "text/vtt",
  json: "application/json",
};
const mediaType = (/** @type {string} */ name) =>
  MEDIA_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ??
  "application/octet-stream";

// Dev-only: serve the audiogen reference recording from assets/ (kept in the
// repo for devs + future videogen use). `apply: "serve"` means this plugin only
// runs in `astro dev`, never in the build, and the file lives outside public/
// Astro's dev-only /_image endpoint loads a local source by fetching
// `/@fs/...` back from itself, using the origin the *browser* used. Behind a
// proxy or a forwarded port (Coder, VS Code) that origin is not reachable from
// inside the container, so every optimised image 500s in dev while the static
// build is fine. Rewrite the Host header for /_image requests only, so the
// self-fetch goes to the address the dev server is actually listening on.
/** @type {import('vite').Plugin} */
const imageEndpointLocalHost = {
  name: "image-endpoint-local-host",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (!(req.url ?? "").startsWith("/_image")) return next();
      const addr = server.httpServer?.address();
      const port =
        typeof addr === "object" && addr
          ? addr.port
          : server.config.server.port;
      if (port) req.headers.host = `localhost:${port}`;
      next();
    });
  },
};

// so it is never copied into dist/ at all - it cannot reach production.
/** @type {import('vite').Plugin} */
const audiogenDevRecording = {
  name: "audiogen-dev-recording",
  apply: "serve",
  configureServer(server) {
    const file = new URL("./assets/audiogen/recording.mp3", import.meta.url);
    server.middlewares.use((req, res, next) => {
      if ((req.url ?? "").split("?")[0] !== "/audiogen/recording.mp3")
        return next();
      if (!existsSync(file)) {
        res.statusCode = 404;
        return res.end("no recording");
      }
      serveFileWithRange(req, res, file, "audio/mpeg");
    });
  },
};

// Dev-only: serve call display assets (calls/media/*) at /calls-media/<file>
// for the /videogen stage. Like the audiogen recording above, the files live
// outside public/ so nothing extra ships to prod; the call page itself embeds
// them through Astro's normal markdown image pipeline. Range requests are
// honoured so a <video> can seek.
/** @type {import('vite').Plugin} */
const callsMediaDev = {
  name: "calls-media-dev",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? "").split("?")[0];
      if (!path.startsWith("/calls-media/")) return next();
      const name = decodeURIComponent(path.slice("/calls-media/".length));
      // One flat directory; refuse anything that tries to walk out of it.
      if (!name || name.includes("/") || name.includes("..")) {
        res.statusCode = 404;
        return res.end("not found");
      }
      const file = new URL(`./calls/media/${name}`, import.meta.url);
      if (!existsSync(file)) {
        res.statusCode = 404;
        return res.end("not found");
      }
      serveFileWithRange(req, res, file, mediaType(name));
    });
  },
};

// Dev-only: serve a call's local videogen cache (.cache/videogen/<id>/<file>,
// gitignored) at /videogen-cache/<id>/<file>. This is where the pipeline keeps
// the finished render, one-off review clips (clips/) and the call's display
// media pulled from its GitHub release (media/, see scripts/videogen/media.mjs). `render.mp4` also falls
// back to the legacy public-root handoff name (<YYMMDD>-etccc-<NN>.mp4), which
// the Astro dev server itself will not serve.
/** @type {import('vite').Plugin} */
const videogenCacheDev = {
  name: "videogen-cache-dev",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? "").split("?")[0];
      const m =
        /^\/videogen-cache\/([A-Za-z0-9_-]+)\/((?:clips\/|media\/)?[^/]+)$/.exec(
          decodeURIComponent(path),
        );
      if (!m) return next();
      const [, id, name] = m;
      // `render` (POST) and `jobs.json` belong to videogenClipJobs below.
      if (name === "render" || name === "jobs.json") return next();
      if (name.includes("..")) {
        res.statusCode = 404;
        return res.end("not found");
      }
      let file = new URL(`./.cache/videogen/${id}/${name}`, import.meta.url);
      if (!existsSync(file) && name === "render.mp4") {
        // legacy location: public/<YYMMDD>-etccc-<NN>.mp4 for id <YYYYMMDD>_<NNN>
        const [ymd, nnn] = id.split("_");
        const nn = String(parseInt(nnn ?? "", 10));
        const legacy = new URL(
          `./public/${(ymd ?? "").slice(2)}-etccc-${nn}.mp4`,
          import.meta.url,
        );
        if (existsSync(legacy)) file = legacy;
      }
      if (!existsSync(file)) {
        res.statusCode = 404;
        return res.end("not found");
      }
      serveFileWithRange(req, res, file, mediaType(name));
    });
  },
};

// Dev-only: one-off clip renders for the review page. POST
// /videogen-cache/<id>/render {start, duration} (main-local seconds) spawns
// scripts/videogen.mjs --clip against this very dev server and writes the
// result to .cache/videogen/<id>/clips/; GET /videogen-cache/<id>/jobs.json
// reports every job's state. State also lands in jobs.json in the cache dir.
/** @type {import('vite').Plugin} */
const videogenClipJobs = {
  name: "videogen-clip-jobs",
  apply: "serve",
  configureServer(server) {
    const root = fileURLToPath(new URL("./", import.meta.url));
    /** @type {Map<string, any[]>} */
    const jobs = new Map();
    const jobsFile = (/** @type {string} */ id) =>
      `${root}.cache/videogen/${id}/jobs.json`;
    const load = (/** @type {string} */ id) => {
      if (!jobs.has(id)) {
        try {
          jobs.set(id, JSON.parse(readFileSync(jobsFile(id), "utf8")));
        } catch {
          jobs.set(id, []);
        }
      }
      return jobs.get(id) ?? [];
    };
    const save = (/** @type {string} */ id) => {
      mkdirSync(`${root}.cache/videogen/${id}`, { recursive: true });
      writeFileSync(jobsFile(id), JSON.stringify(load(id), null, 2));
    };
    // Playwright's bundled chromium can't launch in this devcontainer; use
    // PLAYWRIGHT_CHROMIUM_EXECUTABLE or the newest Nix-built chromium.
    const chromium = () => {
      if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE)
        return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
      try {
        const hits = readdirSync("/nix/store")
          .filter((d) => /-chromium-\d/.test(d) && !/unwrapped/.test(d))
          .sort()
          .map((d) => `/nix/store/${d}/bin/chromium`)
          .filter((f) => existsSync(f));
        return hits[hits.length - 1];
      } catch {
        return undefined;
      }
    };
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? "").split("?")[0];
      const m =
        /^\/videogen-cache\/([A-Za-z0-9_-]+)\/(render|jobs\.json)$/.exec(path);
      if (!m) return next();
      const [, id, what] = m;
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-cache");
      if (what === "jobs.json") return res.end(JSON.stringify(load(id)));
      if (req.method !== "POST") {
        res.statusCode = 405;
        return res.end('{"error":"POST {start,duration}"}');
      }
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        let start = NaN;
        let duration = NaN;
        let label = "";
        try {
          const b = JSON.parse(body || "{}");
          start = Number(b.start);
          duration = Number(b.duration);
          label = String(b.label ?? "");
        } catch {
          /* fall through to the validation below */
        }
        if (!(start >= 0) || !(duration > 0)) {
          res.statusCode = 400;
          return res.end('{"error":"start >= 0 and duration > 0 required"}');
        }
        const exe = chromium();
        if (!exe) {
          res.statusCode = 500;
          return res.end(
            '{"error":"no chromium: set PLAYWRIGHT_CHROMIUM_EXECUTABLE"}',
          );
        }
        const addr = server.httpServer?.address();
        const port =
          typeof addr === "object" && addr
            ? addr.port
            : server.config.server.port;
        const nn = String(parseInt(id.split("_")[1] ?? "", 10));
        const name = `clip-${start.toFixed(2)}-${duration.toFixed(2)}`;
        const dir = `${root}.cache/videogen/${id}/clips`;
        mkdirSync(dir, { recursive: true });
        /** @type {{ name: string; label: string; start: number; duration: number; state: string; startedAt: string; finishedAt: string | null; file: string | null; log: string }} */
        const job = {
          name,
          label,
          start,
          duration,
          state: "running",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          file: null,
          log: "",
        };
        const list = load(id);
        list.unshift(job);
        save(id);
        const child = spawn(
          process.execPath,
          [
            `${root}scripts/videogen.mjs`,
            "--realtime",
            "--clip",
            "--job",
            `/videogen/${nn}/job.json`,
            "--start",
            String(start),
            "--duration",
            String(duration),
            "--fps",
            "60",
            "--port",
            String(port),
            "--out",
            `${dir}/${name}.mp4`,
          ],
          {
            cwd: root,
            env: { ...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE: exe },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        const tail = (/** @type {Buffer} */ d) => {
          job.log = (job.log + d.toString()).slice(-4000);
        };
        child.stdout.on("data", tail);
        child.stderr.on("data", tail);
        child.on("close", (code) => {
          // The driver stamps the output name; settle on the plain name.
          const produced = readdirSync(dir)
            .filter((f) => f.startsWith(`${name}-`) && f.endsWith(".mp4"))
            .sort()
            .pop();
          if (code === 0 && produced) {
            renameSync(`${dir}/${produced}`, `${dir}/${name}.mp4`);
            job.file = `clips/${name}.mp4`;
            job.state = "done";
          } else {
            job.state = "failed";
          }
          job.finishedAt = new Date().toISOString();
          save(id);
        });
        res.statusCode = 202;
        res.end(JSON.stringify(job));
      });
    });
  },
};

// https://astro.build/config
export default defineConfig({
  site: "https://cc.ethereumclassic.org",
  output: "static",
  prefetch: true,
  devToolbar: { enabled: false },
  vite: {
    // audiomotion-analyzer is dynamic-imported on the first play of the
    // /videogen stage. Pre-bundle it so a render server (HMR off, so the page
    // never learns about a dependency re-optimisation) cannot hit a 504
    // "Outdated Optimize Dep" on that import and silently fall back to the
    // deterministic canvas visualiser.
    optimizeDeps: { include: ["audiomotion-analyzer"] },
    plugins: [
      tailwindcss(),
      audiogenDevRecording,
      callsMediaDev,
      videogenCacheDev,
      videogenClipJobs,
      imageEndpointLocalHost,
    ],
    // Don't reload the dev server on non-source churn — notably during a
    // videogen render, where a stray change under .claude/, .cache/ (the
    // render's own MP4 output), or public/ media would otherwise HMR-reload
    // the page mid-capture and corrupt the recording.
    server: {
      // Render server (VIDEOGEN_RENDER=1) runs with HMR fully disabled: the
      // /videogen route is dev-only (so it can't run under `astro preview`),
      // but with no HMR, editing the website on a SEPARATE dev server can never
      // reload the capture page and abort an in-flight render. Start it on its
      // own random port so it never collides with your working dev server.
      hmr: process.env.VIDEOGEN_RENDER ? false : undefined,
      watch: {
        ignored: [
          "**/.claude/**",
          "**/.cache/**",
          "**/public/**/*.{mp4,m4a,mp3,wav}",
          "**/public/*.{mp4,m4a,mp3,wav}",
        ],
      },
    },
  },
  markdown: {
    remarkPlugins: [remarkWebVtt],
    rehypePlugins: [
      [
        rehypeExternalLinks,
        { target: "_blank", rel: ["noopener", "noreferrer"] },
      ],
    ],
  },
  integrations: [
    stripDevRoutes,
    react(),
    icon({
      include: {
        // Brand icons
        "simple-icons": [
          "discord",
          "youtube",
          "github",
          "google",
          "microsoftoutlook",
          "yahoo",
          "apple",
          "x",
          "telegram",
        ],
        // UI icons
        lucide: [
          "calendar",
          "clock",
          "map-pin",
          "chevron-down",
          "chevron-left",
          "chevron-right",
          "chevrons-right",
          "x",
          "phone",
          "copy",
          "check",
          "bell",
          "rss",
          "archive",
          "download",
          "menu",
          "arrow-left",
          "arrow-right",
          "external-link",
          "video",
          "home",
          "calendar-plus",
          "mail",
          "bookmark",
          "newspaper",
          "globe",
          "share-2",
        ],
      },
    }),
  ],
});
