import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { BASE_URL, E2E_DATABASE_URL, REPO_ROOT } from './env';
import { zurichToday } from './time';

export interface SeededWorld {
  householdId: string;
  /** The day (Europe/Zurich) the sample messages belong to. */
  today: string;
  julian: { id: string; email: string; password: string; sessionCookie: string };
  lisa: { id: string; email: string; sessionCookie: string };
  max: { id: string; email: string; sessionCookie: string };
  itemIds: Record<string, string>;
  shoppingIds: Record<string, string>;
  conversations: { group: string; lisa: string; max: string };
}

/**
 * Runs `apps/server/scripts/seed-demo.ts` (with tsx, as a child process) against the E2E server/database and
 * returns the ids and the session cookie of the seeded signed-in person ("Julian" = "Du").
 */
export function seedWorld(options: { designRoles?: boolean } = {}): SeededWorld {
  const tsx = path.join(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
  const args = [
    tsx,
    path.join(REPO_ROOT, 'apps/server/scripts/seed-demo.ts'),
    '--json',
    '--base-url',
    BASE_URL,
    '--database-url',
    E2E_DATABASE_URL,
    '--today',
    zurichToday(),
  ];
  if (options.designRoles) args.push('--design-roles');
  const output = execFileSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = JSON.parse(output.trim().split('\n').pop() ?? '{}');
  return {
    householdId: result.householdId,
    today: result.today,
    julian: {
      id: result.users.julian.id,
      email: result.users.julian.email,
      password: result.password,
      sessionCookie: result.users.julian.sessionCookie,
    },
    lisa: { id: result.users.lisa.id, email: result.users.lisa.email, sessionCookie: result.users.lisa.sessionCookie },
    max: { id: result.users.max.id, email: result.users.max.email, sessionCookie: result.users.max.sessionCookie },
    itemIds: result.itemIds,
    shoppingIds: result.shoppingIds,
    conversations: result.conversations,
  };
}
