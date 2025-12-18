// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  site: 'https://cc.ethereumclassic.org',
  output: 'static',
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [
    icon({
      include: {
        // Brand icons
        'simple-icons': ['discord', 'youtube', 'github'],
        // UI icons
        'lucide': [
          'calendar',
          'clock',
          'map-pin',
          'chevron-down',
          'chevron-left',
          'chevron-right',
          'x',
          'copy',
          'check',
          'bell',
          'rss',
          'archive',
          'download',
          'menu',
          'arrow-left',
          'arrow-right',
          'external-link',
        ],
      },
    }),
  ],
});
