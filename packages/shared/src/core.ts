/**
 * `@homi/shared/core` – the zod-free, side-effect-free part of the contract: constants and limits,
 * enum values and German labels, decimal arithmetic, display formatters and text-hygiene helpers.
 *
 * The web app imports these from here so that formatting a price or a unit label does not load zod
 * (≈ 25 kB gzip) or install the zod error map. Everything is also re-exported by the full barrel
 * `@homi/shared` (schemas + DTO types), whose public API is unchanged.
 */
export * from './constants';
export * from './enum-values';
export * from './decimal';
export * from './format';
export * from './text';
