// Bundles the server into dist/index.js (ESM, Node 22+).
// @homi/shared (TypeScript source) and the generated Prisma client are bundled; every other
// dependency listed in package.json stays external and is resolved from node_modules at runtime.
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(serverDir, 'package.json'), 'utf8'));

const BUNDLED = new Set(['@homi/shared']);
const external = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].filter(
  (name) => !BUNDLED.has(name),
);

await rm(path.join(serverDir, 'dist'), { recursive: true, force: true });

const result = await build({
  absWorkingDir: serverDir,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  legalComments: 'none',
  // Package names also match their subpaths (e.g. @prisma/client/runtime/client).
  external,
  banner: {
    // CommonJS interop for bundled code that calls require()/__dirname.
    js: [
      "import { createRequire as __homiCreateRequire } from 'node:module';",
      "import { fileURLToPath as __homiFileURLToPath } from 'node:url';",
      "import { dirname as __homiDirname } from 'node:path';",
      'const require = __homiCreateRequire(import.meta.url);',
      'const __filename = __homiFileURLToPath(import.meta.url);',
      'const __dirname = __homiDirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'info',
  metafile: true,
});

const outputs = Object.entries(result.metafile.outputs)
  .filter(([file]) => file.endsWith('.js'))
  .map(([file, info]) => `${file} ${(info.bytes / 1024).toFixed(1)} KiB`);
console.log(`built ${outputs.join(', ')} (external: ${external.length} packages)`);
