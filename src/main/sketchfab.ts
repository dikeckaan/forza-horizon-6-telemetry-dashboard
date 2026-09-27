import { createWriteStream, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { SketchfabModel } from '../shared/ipc';
import { mt } from './i18n';

const API = 'https://api.sketchfab.com/v3';

interface RawResult {
  uid: string;
  name: string;
  viewerUrl: string;
  faceCount: number;
  user?: { displayName?: string; username?: string };
  license?: { label?: string };
  thumbnails?: { images?: { url: string; width: number }[] };
  archives?: { glb?: { size?: number } };
}

/** Public search, no account needed. Only downloadable models are returned. */
export async function searchModels(query: string): Promise<SketchfabModel[]> {
  const url = `${API}/search?type=models&downloadable=true&count=24&archives_flavours=false&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(mt('sfSearchError', { status: res.status }));
  const json = (await res.json()) as { results: RawResult[] };
  return json.results.map((r) => {
    const imgs = (r.thumbnails?.images ?? []).slice().sort((a, b) => a.width - b.width);
    const thumb = imgs.find((i) => i.width >= 256) ?? imgs.at(-1);
    return {
      uid: r.uid,
      name: r.name,
      author: r.user?.displayName || r.user?.username || '',
      license: r.license?.label ?? '',
      faces: r.faceCount ?? 0,
      glbBytes: r.archives?.glb?.size ?? 0,
      thumbnail: thumb?.url ?? '',
      viewerUrl: r.viewerUrl,
    };
  });
}

export async function checkToken(token: string): Promise<string> {
  const res = await fetch(`${API}/me`, { headers: { Authorization: `Token ${token}` } });
  if (res.status === 401 || res.status === 403) throw new Error(mt('sfInvalidKey'));
  if (!res.ok) throw new Error(mt('sfError', { status: res.status }));
  const me = (await res.json()) as { displayName?: string; username?: string };
  return me.displayName || me.username || mt('sfConnected');
}

/**
 * Downloads the GLB flavour of a model into `dir/<id>.glb`.
 * Requires the user's own API token (Sketchfab only serves downloads to accounts).
 */
export async function downloadModel(uid: string, token: string, dir: string, id: string, onProgress: (received: number, total: number) => void): Promise<void> {
  const meta = await fetch(`${API}/models/${uid}/download`, { headers: { Authorization: `Token ${token}` } });
  if (meta.status === 401 || meta.status === 403) throw new Error(mt('sfKeyMissing'));
  if (!meta.ok) throw new Error(mt('sfNoLink', { status: meta.status }));
  const links = (await meta.json()) as { glb?: { url: string; size?: number } };
  if (!links.glb?.url) throw new Error(mt('sfNoGlb'));

  const res = await fetch(links.glb.url);
  if (!res.ok || !res.body) throw new Error(mt('sfDownloadFailed', { status: res.status }));
  const total = Number(res.headers.get('content-length')) || links.glb.size || 0;
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `${id}.part`);
  const out = createWriteStream(tmp);
  let received = 0;
  let lastReport = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      if (received - lastReport > 256 * 1024) {
        lastReport = received;
        onProgress(received, total);
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    renameSync(tmp, join(dir, `${id}.glb`));
    onProgress(received, total || received);
  } catch (e) {
    out.destroy();
    try {
      unlinkSync(tmp);
    } catch {
      /* nothing to clean */
    }
    throw e;
  }
}
