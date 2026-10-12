import { afterAll, beforeAll } from 'vitest';
import { disconnectTestPrisma, resetDatabase } from '../helpers/db';

// Every integration test file starts with empty tables.
beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});
