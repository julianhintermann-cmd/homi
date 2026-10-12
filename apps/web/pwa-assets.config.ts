import { defineConfig, type Preset } from '@vite-pwa/assets-generator/config';

/** App icon tile colour from the design ("App Icon" board fill). */
const background = '#111111';

/**
 * Full-bleed icons: the source SVG already contains the dark tile with the centred glyph
 * (glyph = 50 % of the tile, i.e. inside the 80 % maskable safe zone), so no extra padding.
 */
const preset: Preset = {
  transparent: {
    sizes: [64, 192, 512],
    favicons: [[48, 'favicon.ico']],
    padding: 0,
    resizeOptions: { background, fit: 'contain' },
  },
  maskable: {
    sizes: [512],
    padding: 0,
    resizeOptions: { background, fit: 'contain' },
  },
  apple: {
    sizes: [180],
    padding: 0,
    resizeOptions: { background, fit: 'contain' },
  },
};

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset,
  images: ['public/app-icon.svg'],
});
