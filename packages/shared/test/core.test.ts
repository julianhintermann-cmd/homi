import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as barrel from '../src';
import * as core from '../src/core';

/*
 * `@homi/shared/core` must stay zod-free and side-effect free (the web app formats prices and unit
 * labels through it without loading zod), and the full barrel must keep exporting everything.
 */

const CORE_MODULES = ['core', 'constants', 'enum-values', 'decimal', 'format', 'text'];

function importsOf(module: string): string[] {
  const source = readFileSync(fileURLToPath(new URL(`../src/${module}.ts`, import.meta.url)), 'utf8');
  return [...source.matchAll(/(?:import|export)[^'";]*from '([^']+)'/g)].map((match) => match[1] ?? '');
}

describe('@homi/shared/core', () => {
  it('only imports other core modules (no zod, no schema modules)', () => {
    for (const module of CORE_MODULES) {
      for (const specifier of importsOf(module)) {
        expect(
          CORE_MODULES.map((name) => `./${name}`),
          `${module}.ts imports ${specifier}`,
        ).toContain(specifier);
      }
    }
  });

  it('is a subset of the full barrel (public API unchanged)', () => {
    for (const [name, value] of Object.entries(core)) {
      expect(barrel, name).toHaveProperty(name);
      expect((barrel as Record<string, unknown>)[name], name).toBe(value);
    }
  });

  it('keeps the enum value objects and labels', () => {
    expect(core.HouseholdRole.OWNER).toBe('OWNER');
    expect(core.Unit.MILLILITER).toBe('MILLILITER');
    expect(barrel.HouseholdRoleSchema.enum).toEqual({ OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' });
    expect(core.HOUSEHOLD_ROLE_LABELS).toEqual({ OWNER: 'Inhaber:in', ADMIN: 'Verwaltung', MEMBER: 'Mitglied' });
    expect(barrel.MEMBER_ROLE_LABELS).toBe(core.HOUSEHOLD_ROLE_LABELS);
    expect(core.formatCHF('2485.5')).toBe('CHF 2’485.50');
  });
});
