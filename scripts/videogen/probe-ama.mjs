import { chromium } from "playwright";
// Probe that the live visualiser attaches after a mid-call start.
// PORT=<render server> CALL=<NN> T=<main-local sec> node scripts/videogen/probe-ama.mjs
const PORT = process.env.PORT ?? "4321";
const CALL = process.env.CALL ?? "59";
const T = +(process.env.T ?? 60);
const b = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const p = await (
  await b.newContext({ viewport: { width: 1920, height: 1080 } })
).newPage();
p.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    console.log("CONSOLE", m.type(), m.text().slice(0, 200));
});
await p.goto(
  `http://localhost:${PORT}/videogen?job=/videogen/${CALL}/job.json&preview=1`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await p.waitForFunction(() => window.__ready !== undefined);
await p.evaluate(() => window.__ready);
await p.evaluate((t) => window.__seekMain(t), T);
await p.click("#preview-play");
for (const wait of [500, 1500, 3000]) {
  await p.waitForTimeout(wait);
  const st = await p.evaluate(() => {
    const a = document.getElementById("preview-audio");
    const ama = document.getElementById("ama");
    const viz = document.getElementById("viz");
    return {
      t: a.currentTime.toFixed(2),
      paused: a.paused,
      ready: a.readyState,
      err: a.error && a.error.code,
      muted: a.muted,
      vol: a.volume,
      amaHidden: ama.classList.contains("hidden"),
      vizHidden: viz.classList.contains("hidden"),
      amaCanvas: !!ama.querySelector("canvas"),
    };
  });
  console.log(
    "state",
    JSON.stringify(st),
    st.amaCanvas && !st.amaHidden
      ? "OK live analyser"
      : "WARN analyser not live",
  );
}
await p.screenshot({
  path: process.env.OUT ?? "/tmp/probe-ama.jpg",
  type: "jpeg",
  quality: 80,
  clip: { x: 0, y: 0, width: 1920, height: 1080 },
});
await b.close();
