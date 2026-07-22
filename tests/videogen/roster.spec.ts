import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const AUDIO = join(FIXTURES, "roster.m4a");

const VTT_TEXT = [
  "WEBVTT",
  "",
  "1",
  "00:00:00.000 --> 00:00:02.000",
  "Istora Mandiri: First, Istora speaks.",
  "",
  "2",
  "00:00:02.000 --> 00:00:04.000",
  "Diego L.L.: Then Diego responds.",
  "",
  "3",
  "00:00:04.000 --> 00:00:06.000",
  "Lunar: Lunar chimes in.",
  "",
  "4",
  "00:00:06.000 --> 00:00:08.000",
  "IAV: And IAV closes.",
  "",
].join("\n");

const JOB = {
  call: { number: 53, title: "Neo Classic", date: "2026-05-29" },
  audio: "/__job/audio",
  vtt: "/__job/vtt",
  participants: [
    { name: "Istora Mandiri", role: "Host" },
    { name: "Diego L.L.", role: "ECIP Editor" },
    { name: "Lunar", role: "Contributor" },
    { name: "IAV", role: "Builder" },
  ],
};

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
      "sine=frequency=440:duration=8",
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

test("renders /videogen roster: call meta + active speaker animation", async ({
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
  await context.addInitScript((j) => {
    window.__job = j;
  }, JOB);

  await page.goto("/videogen");
  await page.evaluate(() => window.__ready);

  // Call meta
  await expect(page.locator("#call-num")).toHaveText("#53");
  await expect(page.locator("#title")).toHaveText("Neo Classic");
  await expect(page.locator("#date")).toHaveText("2026.05.29");

  // Roster has all four participants
  const cards = page.locator(".participant");
  await expect(cards).toHaveCount(4);
  await expect(
    page.locator('.participant[data-name="Istora Mandiri"]'),
  ).toBeVisible();
  await expect(
    page.locator('.participant[data-name="Diego L.L."]'),
  ).toBeVisible();
  await expect(page.locator('.participant[data-name="Lunar"]')).toBeVisible();
  await expect(page.locator('.participant[data-name="IAV"]')).toBeVisible();

  // Legacy chip hidden in roster mode
  await expect(page.locator("#speaker-card")).toBeHidden();

  // Active toggles as the cue advances
  await page.evaluate(() => window.__seek!(1));
  await expect(page.locator(".participant.active")).toHaveAttribute(
    "data-name",
    "Istora Mandiri",
  );

  await page.evaluate(() => window.__seek!(3));
  await expect(page.locator(".participant.active")).toHaveAttribute(
    "data-name",
    "Diego L.L.",
  );

  await page.evaluate(() => window.__seek!(5));
  await expect(page.locator(".participant.active")).toHaveAttribute(
    "data-name",
    "Lunar",
  );

  await page.evaluate(() => window.__seek!(7));
  await expect(page.locator(".participant.active")).toHaveAttribute(
    "data-name",
    "IAV",
  );

  // Subtitle text reflects current cue
  await page.evaluate(() => window.__seek!(3));
  await expect(page.locator("#subtitle")).toContainText("Then Diego responds");
});
