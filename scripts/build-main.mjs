import { build } from 'esbuild';

const watch = process.argv.includes('--watch');
const common = { bundle: true, platform: 'node', target: 'node22', external: ['electron'], sourcemap: true, logLevel: 'info' };
const configs = [
  { ...common, entryPoints: ['src/main/main.ts'], outfile: 'out/main/main.js', format: 'esm' },
  // sandboxed preload must be CommonJS
  { ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'out/preload/preload.cjs', format: 'cjs' },
];

if (watch) {
  const { context } = await import('esbuild');
  for (const c of configs) await (await context(c)).watch();
} else {
  await Promise.all(configs.map((c) => build(c)));
}
