import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const AUDIO = join(FIXTURES, "sample.m4a");

const VTT_TEXT = [
  "WEBVTT",
  "",
  "00:00:00.000 --> 00:00:02.000",
  "<v Alice Example>Hello, this is a test.",
  "",
  "00:00:02.000 --> 00:00:04.000",
  "<v Bob Example>Yes, indeed.",
  "",
].join("\n");

test.beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
  if (existsSync(AUDIO)) return;
  const ff = ffmpegPath as unknown as string;
  const res = spawnSync(
    ff,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=2",
      "-filter_complex",
      "[0:a][1:a]concat=n=2:v=0:a=1",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      AUDIO,
    ],
    { stdio: "pipe" },
  );
  if (res.status !== 0) {
    throw new Error(
      `ffmpeg failed (${res.status}): ${res.stderr?.toString() ?? ""}`,
    );
  }
});

declare global {
  interface Window {
    __job?: unknown;
    __ready?: Promise<void>;
    __seek?: (t: number) => void;
    __duration?: number;
    __cueCount?: number;
  }
}

test("renders /videogen with VTT cues, speaker chip, and viz", async ({
  page,
  context,
}) => {
  await context.route("**/__job/audio", (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "audio/mp4" },
      body: readFileSync(AUDIO),
    });
  });
  await context.route("**/__job/vtt", (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/vtt" },
      body: VTT_TEXT,
    });
  });
  await context.addInitScript(() => {
    window.__job = {
      title: "Test Call",
      speaker: "Alice Example",
      role: "Tester",
      avatar: null,
      audio: "/__job/audio",
      vtt: "/__job/vtt",
      fps: 60,
      bands: 48,
    };
  });

  await page.goto("/videogen");
  await page.evaluate(() => window.__ready);

  const duration = await page.evaluate(() => window.__duration);
  expect(duration).toBeGreaterThan(3.5);
  expect(duration).toBeLessThan(4.5);

  const cueCount = await page.evaluate(() => window.__cueCount);
  expect(cueCount).toBe(2);

  await expect(page.locator("#title")).toHaveText("Test Call");
  await expect(page.locator("#speaker")).toHaveText("Alice Example");
  await expect(page.locator("#initials")).toHaveText("AE");

  // First cue
  await page.evaluate(() => window.__seek!(1));
  await expect(page.locator("#subtitle")).toContainText(
    "Hello, this is a test",
  );

  // Second cue
  await page.evaluate(() => window.__seek!(3));
  await expect(page.locator("#subtitle")).toContainText("Yes, indeed");

  // Gap (after end)
  await page.evaluate(() => window.__seek!(5));
  await expect(page.locator("#subtitle")).toHaveText("");

  // Visualizer canvas has painted bars at t=1s
  await page.evaluate(() => window.__seek!(1));
  const hasContent = await page.evaluate(() => {
    const c = document.getElementById("viz") as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  });
  expect(hasContent).toBe(true);
});
