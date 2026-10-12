import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

// Prisma 7 no longer loads `.env` files automatically. Load the repository-level `.env`
// (and an optional app-level one) without overriding variables that are already set,
// so CI / Docker / test runners can inject DATABASE_URL explicitly.
loadDotenv({ path: [path.resolve(serverDir, '.env'), path.resolve(serverDir, '../../.env')], quiet: true });

export default defineConfig({
  schema: path.join(serverDir, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(serverDir, 'prisma', 'migrations'),
  },
  datasource: {
    // Not required for `prisma generate` / `validate` / `migrate diff --from-empty`, so it is optional here.
    // Migration commands that need a connection fail with a clear Prisma error when it is missing.
    url: process.env.DATABASE_URL,
  },
});
