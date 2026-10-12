/**
 * Writes the source SVGs for the PWA icons from the design's "App Icon" (Freegma/Penpot, page "Cover"):
 *
 *   App Icon   88 × 88 board, fill #111111
 *   └ icon / house   44 × 44 (24-unit glyph scaled ×1.8333), centred, stroke #F7F6F3, 1.04 px, round caps/joins
 *
 * - public/app-icon.svg  full-bleed square (iOS applies its own mask) → input for @vite-pwa/assets-generator
 * - public/favicon.svg   rounded tile with the regular 2.0 pt icon weight so the glyph stays legible at 16–32 px
 *
 * Run with `npm run pwa:assets -w @homi/web` (Node ≥ 22.18 strips the TypeScript types natively).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ICON_PATHS } from '../src/icons/paths.ts';

const BACKGROUND = '#111111';
const GLYPH_COLOR = '#F7F6F3';
const ICON_GRID = 24;

/** Values measured in the design file (88 px board). */
const DESIGN_TILE = 88;
const DESIGN_GLYPH = 44;
const DESIGN_STROKE_PX = 1.04;

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

function glyphMarkup(): string {
  // `fill="CURRENT"` marks filled sub-paths in the shared icon data.
  return ICON_PATHS.house.replaceAll('CURRENT', GLYPH_COLOR);
}

function appIconSvg(): string {
  const scale = DESIGN_GLYPH / ICON_GRID;
  const offset = (DESIGN_TILE - DESIGN_GLYPH) / 2;
  const strokeWidth = DESIGN_STROKE_PX / scale;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${DESIGN_TILE} ${DESIGN_TILE}">`,
    `<rect width="${DESIGN_TILE}" height="${DESIGN_TILE}" fill="${BACKGROUND}"/>`,
    `<g transform="translate(${offset} ${offset}) scale(${round(scale)})" fill="none" stroke="${GLYPH_COLOR}"`,
    ` stroke-width="${round(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">${glyphMarkup()}</g>`,
    `</svg>`,
    '',
  ].join('');
}

function faviconSvg(): string {
  const tile = 32;
  const glyph = 20;
  const scale = glyph / ICON_GRID;
  const offset = (tile - glyph) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">`,
    `<rect width="${tile}" height="${tile}" rx="7.2" fill="${BACKGROUND}"/>`,
    `<g transform="translate(${offset} ${offset}) scale(${round(scale)})" fill="none" stroke="${GLYPH_COLOR}"`,
    ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyphMarkup()}</g>`,
    `</svg>`,
    '',
  ].join('');
}

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
writeFileSync(`${publicDir}app-icon.svg`, appIconSvg());
writeFileSync(`${publicDir}favicon.svg`, faviconSvg());
console.log('Wrote public/app-icon.svg and public/favicon.svg');
