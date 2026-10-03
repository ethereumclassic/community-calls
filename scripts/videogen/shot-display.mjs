// Screenshot the /videogen stage at main-local times (e.g. to check display windows).
// PORT=<dev server> CALL=<NN> TIMES=1199,1203,1260 OUT=/tmp node scripts/videogen/shot-display.mjs
import { chromium } from "playwright";
const PORT = process.env.PORT ?? "4321";
const CALL = process.env.CALL ?? "59";
const OUTDIR = process.env.OUT ?? "/tmp";
const times = (process.env.TIMES ?? "1198,1201,1202.5,1230,1330,1337.5,1339")
  .split(",")
  .map(Number);
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
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
p.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text());
});
await p.goto(
  `http://localhost:${PORT}/videogen?job=/videogen/${CALL}/job.json&preview=1`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await p.waitForFunction(() => window.__ready !== undefined);
await p.evaluate(() => window.__ready);
await p.waitForTimeout(500);
for (const t of times) {
  await p.evaluate((s) => window.__seekMain(s), t);
  await p.waitForTimeout(900);
  await p.evaluate(
    () => (document.getElementById("preview-controls").style.display = "none"),
  );
  await p.screenshot({
    path: `${OUTDIR}/dm-${t}.jpg`,
    type: "jpeg",
    quality: 85,
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  console.log("shot", t);
}
await b.close();
