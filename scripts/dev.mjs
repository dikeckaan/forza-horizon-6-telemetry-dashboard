// Runs Vite dev server + esbuild watch + Electron with live renderer reload.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];

await new Promise((res, rej) => {
  const p = spawn(process.execPath, ['scripts/build-main.mjs'], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error('main build failed'))));
});

const electronBin = (await import('electron')).default;
const el = spawn(electronBin, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_URL: url } });
el.on('exit', async () => {
  await server.close();
  process.exit(0);
});
