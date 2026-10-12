/**
 * @homi/shared – the API contract shared by server and web (docs/ARCHITECTURE.md §5, §6).
 * Pure TypeScript: no Node or DOM APIs.
 */
import { installZodDefaults } from './zod-de';

installZodDefaults();

export * from './constants';
export * from './enums';
export * from './decimal';
export * from './format';
export * from './errors';
export * from './common';
export * from './auth';
export * from './households';
export * from './inventory';
export * from './shopping';
export * from './chat';
export * from './activity';
export * from './dashboard';
export * from './realtime';
export { germanErrorMap, installZodDefaults } from './zod-de';
