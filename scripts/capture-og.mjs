#!/usr/bin/env node
// Captures OG images from /og/[format] routes using Playwright
// Usage: npx playwright test --config=scripts/capture-og.mjs
//   or:  node scripts/capture-og.mjs [base-url]
// Default base URL: http://localhost:4321

import { mkdirSync } from "fs";

// Resolve playwright from npx cache or local install
const playwrightPath = [
  "playwright",
  "/home/node/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs",
];

let chromium;
for (const p of playwrightPath) {
  try {
    const mod = await import(p);
    chromium = mod.chromium;
    break;
  } catch {
    continue;
  }
}

if (!chromium) {
  console.error(
    "Playwright not found. Install with: npm i -D playwright\nOr run via: npx playwright install chromium && node scripts/capture-og.mjs",
  );
  process.exit(1);
}

const BASE_URL = process.argv[2] || "http://localhost:4321";

const formats = {
  landscape: { width: 1200, height: 630 },
  square: { width: 1200, height: 1200 },
  twitter: { width: 1200, height: 675 },
  portrait: { width: 1080, height: 1350 },
  wide: { width: 1200, height: 600 },
};

mkdirSync("public", { recursive: true });

const browser = await chromium.launch();

for (const [name, { width, height }] of Object.entries(formats)) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${BASE_URL}/og/${name}`, { waitUntil: "networkidle" });

  // Hide Astro dev toolbar
  await page.evaluate(() => {
    const toolbar = document.querySelector("astro-dev-toolbar");
    if (toolbar) toolbar.style.display = "none";
  });

  const outPath =
    name === "landscape" ? "public/og.png" : `public/og-${name}.png`;
  await page.screenshot({
    path: outPath,
    clip: { x: 0, y: 0, width, height },
  });
  console.log(`${outPath} (${width}x${height})`);
  await page.close();
}

await browser.close();
console.log("Done.");
