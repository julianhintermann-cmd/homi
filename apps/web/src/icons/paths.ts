// Icon geometry extracted from the Homi Freegma/Penpot design ("Foundations › Icons").
// All icons use a 24×24 viewBox, round caps/joins and are stroked with `currentColor`.
// `fill="CURRENT"` marks sub-paths that are filled with the icon colour.
// Visual stroke weight in the design: 1.7 pt (2.0 pt for the active tab / emphasis).

export const ICON_PATHS = {
  house: `<path d="M3.5 10.8 12 3.8l8.5 7"/><path d="M5.8 9.2v10a1.2 1.2 0 0 0 1.2 1.2h3.3v-5.6h3.4v5.6H17a1.2 1.2 0 0 0 1.2-1.2v-10"/>`,
  stack: `<path d="M12 3.2 3.5 7.6 12 12l8.5-4.4L12 3.2Z"/><path d="M3.5 12 12 16.4l8.5-4.4"/><path d="M3.5 16.4 12 20.8l8.5-4.4"/>`,
  cart: `<path d="M2.8 3.8h2.1l2.3 10.9a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.45-1.1l1.75-6.9H5.7"/><circle cx="9.6" cy="19.6" r="1.25"/><circle cx="17" cy="19.6" r="1.25"/>`,
  bubbles: `<path d="M13.6 4.2H5.4a2.9 2.9 0 0 0-2.9 2.9v4.6a2.9 2.9 0 0 0 2.9 2.9h.4v3l3.4-3h4.4a2.9 2.9 0 0 0 2.9-2.9V7.1a2.9 2.9 0 0 0-2.9-2.9Z"/><path d="M19.4 8.6a2.9 2.9 0 0 1 2.1 2.8v4.3a2.9 2.9 0 0 1-2.9 2.9h-.3v2.6l-3-2.6h-3.6a2.9 2.9 0 0 1-2.4-1.3"/>`,
  bubble: `<path d="M12 4C7 4 3.2 7.3 3.2 11.4c0 2.3 1.2 4.3 3.1 5.7l-.7 3.2 3.6-1.9c.9.2 1.8.3 2.8.3 5 0 8.8-3.3 8.8-7.3S17 4 12 4Z"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  search: `<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 4.6 4.6"/>`,
  chevR: `<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>`,
  chevL: `<path d="M14.5 5.5 8 12l6.5 6.5"/>`,
  chevD: `<path d="m6 9.5 6 6 6-6"/>`,
  updown: `<path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4"/>`,
  person: `<circle cx="12" cy="8.2" r="3.8"/><path d="M4.6 20.4c.8-3.9 3.8-6 7.4-6s6.6 2.1 7.4 6"/>`,
  personCircle: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.6 18.2c1.2-2.1 3.1-3.2 5.4-3.2s4.2 1.1 5.4 3.2"/>`,
  personPlus: `<circle cx="10" cy="8.2" r="3.6"/><path d="M3 20.2c.8-3.7 3.6-5.7 7-5.7 1.4 0 2.7.3 3.8 1"/><path d="M18.5 13v6M15.5 16h6"/>`,
  check: `<path d="m5.5 12.6 4.3 4.3 8.7-9.6"/>`,
  camera: `<path d="M3.8 8.6a2 2 0 0 1 2-2h2.1l1.6-2.1h5l1.6 2.1h2.1a2 2 0 0 1 2 2v9.4a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13.1" r="3.5"/>`,
  photo: `<rect x="3.5" y="5" width="17" height="14" rx="2.6"/><circle cx="9" cy="10" r="1.6"/><path d="m3.8 16.6 4.6-4 4 3.4 3-2.4 5.2 4.2"/>`,
  minus: `<path d="M5.5 12h13"/>`,
  clip: `<path d="m19.6 11.4-7.7 7.7a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3"/>`,
  arrowUp: `<path d="M12 19V5.5M6.5 11 12 5.5l5.5 5.5"/>`,
  trash: `<path d="M4.5 6.6h15M9.5 6.6V4.6h5v2M6.6 6.6l.8 12.2a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.8-12.2M10 10.5v6M14 10.5v6"/>`,
  pencil: `<path d="m15.6 4.6 3.8 3.8L9.2 18.6l-4.6.8.8-4.6L15.6 4.6Z"/>`,
  sliders: `<path d="M4 7.5h9.5M18.5 7.5H20M4 16.5h3.5M12.5 16.5H20"/><circle cx="16" cy="7.5" r="2.3"/><circle cx="10" cy="16.5" r="2.3"/>`,
  appearance: `<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="CURRENT"/>`,
  xmark: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  compose: `<path d="M19.5 13v5.4a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18.4V6.1a1.6 1.6 0 0 1 1.6-1.6H11"/><path d="m17.6 3.6 2.8 2.8-8.2 8.2H9.4v-2.8l8.2-8.2Z"/>`,
  tray: `<path d="M3.6 13.6 6 5.4h12l2.4 8.2v5a1.5 1.5 0 0 1-1.5 1.5H5.1a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M3.6 13.6h4.9l1.2 2.4h4.6l1.2-2.4h4.9"/>`,
  checkCircle: `<circle cx="12" cy="12" r="8.6"/><path d="m8 12.3 2.8 2.8 5.3-5.6"/>`,
  ellipsis: `<circle cx="5.5" cy="12" r="1.5" fill="CURRENT" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="CURRENT" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="CURRENT" stroke="none"/>`,
  tag: `<path d="M3.8 12.4V4.8a1 1 0 0 1 1-1h7.6l8 8a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0l-8-8Z"/><circle cx="8.3" cy="8.3" r="1.4"/>`,
  grid: `<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>`,
  wifi: `<path d="M3.2 9.2a12.5 12.5 0 0 1 17.6 0" /><path d="M6.3 12.4a8 8 0 0 1 11.4 0"/><path d="M9.4 15.6a3.6 3.6 0 0 1 5.2 0"/><circle cx="12" cy="18.6" r="1.1" fill="CURRENT" stroke="none"/>`,
  mic: `<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>`,
  bell: `<path d="M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.6 1.8H4.6Z"/><path d="M10 20.4a2.2 2.2 0 0 0 4 0"/>`,
  arrowR: `<path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5"/>`,
  doorOut: `<path d="M14 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5"/>`,
} as const;

export type IconName = keyof typeof ICON_PATHS;
