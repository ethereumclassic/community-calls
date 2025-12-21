// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import react from "@astrojs/react";
import rehypeExternalLinks from "rehype-external-links";

// https://astro.build/config
export default defineConfig({
  site: "https://cc.ethereumclassic.org",
  output: "static",
  prefetch: true,
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    rehypePlugins: [
      [
        rehypeExternalLinks,
        { target: "_blank", rel: ["noopener", "noreferrer"] },
      ],
    ],
  },
  integrations: [
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
        ],
        // UI icons
        lucide: [
          "calendar",
          "clock",
          "map-pin",
          "chevron-down",
          "chevron-left",
          "chevron-right",
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
        ],
      },
    }),
  ],
});
