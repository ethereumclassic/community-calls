// Deterministic 60fps capture of an animated web page (e.g. the Triforce
// globe): virtualise time in the
// page (requestAnimationFrame + performance.now + Date.now) so each frame is
// fully rendered by software GL before we screenshot it, and the animation
// advances exactly 1/60 s per frame regardless of render speed.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
// URL=<page> OUT=<frames dir> SECONDS=<n> CLIP=x,y,w,h node scripts/videogen/capture-page-vt.mjs
// then: ffmpeg -framerate 60 -i <dir>/f%05d.jpg -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4
const URL = process.env.URL || "https://triforce.classix.dev/";
const OUT = process.env.OUT || "/tmp/page-vt";
mkdirSync(OUT, { recursive: true });
const CLIP = (process.env.CLIP || "0,0,1920,1080").split(",").map(Number);
const FPS = 60,
  SECONDS = +(process.env.SECONDS || 60),
  FRAMES = FPS * SECONDS;
const b = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const ctx = await b.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
await ctx.addInitScript(() => {
  // Real time runs until we take over; then time only moves when __vtStep is called.
  let virtual = null;
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const rafQueue = [];
  let rafId = 0;
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCaf = window.cancelAnimationFrame.bind(window);
  const pending = new Map();
  window.requestAnimationFrame = (cb) => {
    if (virtual === null) return realRaf(cb);
    const id = ++rafId;
    pending.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (virtual === null) return realCaf(id);
    pending.delete(id);
  };
  performance.now = () => (virtual === null ? realNow() : virtual);
  Date.now = () =>
    virtual === null ? realDateNow() : Math.round(virtual + window.__vtEpoch);
  window.__vtStart = () => {
    virtual = realNow();
    window.__vtEpoch = realDateNow() - virtual;
  };
  window.__vtStep = (ms) => {
    virtual += ms;
    const cbs = [...pending.values()];
    pending.clear();
    for (const cb of cbs) {
      try {
        cb(virtual);
      } catch (e) {}
    }
    return pending.size;
  };
});
const p = await ctx.newPage();
await p.goto(URL, { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(8000); // let the globe settle
await p.evaluate(() => window.__vtStart());
const clip = { x: CLIP[0], y: CLIP[1], width: CLIP[2], height: CLIP[3] };
const t0 = Date.now();
for (let i = 0; i < FRAMES; i++) {
  await p.evaluate((ms) => window.__vtStep(ms), 1000 / FPS);
  await p.screenshot({
    path: `${OUT}/f${String(i).padStart(5, "0")}.jpg`,
    type: "jpeg",
    quality: 92,
    clip,
  });
  if (i % 300 === 0)
    console.log(
      `frame ${i}/${FRAMES} ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
}
console.log(
  "CAPTURE_DONE",
  FRAMES,
  "frames in",
  ((Date.now() - t0) / 1000).toFixed(0),
  "s",
);
await b.close();
