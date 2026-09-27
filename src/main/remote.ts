import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { mt } from './i18n';

/**
 * LAN "second screen": serves the built dashboard to phones/tablets and streams
 * live packets to them with Server-Sent Events. Read-mostly by design — no
 * deletes, no file dialogs, and the Sketchfab token never leaves this process.
 */
export interface RemoteHooks {
  rendererDir: string;
  getSettings(): unknown;
  setSettings(patch: Record<string, unknown>): unknown;
  getStatus(): unknown;
  listSessions(): unknown;
  sessionPath(name: string): string | null;
  modelPath(id: string): string | null;
  /** host names this server answers to (localhost + this machine's LAN IPs) */
  allowedHosts(): string[];
  /** secret every /api request must carry as ?k= */
  key(): string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream',
  '.md': 'text/plain; charset=utf-8',
};

// settings a remote screen may change; everything else stays desktop-only
const REMOTE_WRITABLE = new Set(['units', 'carPaints', 'scene', 'ground', 'fx', 'carModels', 'language']);

/** What remote screens get to see: no LAN key, no account details. */
function publicSettings(raw: unknown) {
  const { remote: _remote, sketchfab, ...rest } = (raw ?? {}) as Record<string, unknown> & { sketchfab?: { connected?: boolean } };
  void _remote;
  return { ...rest, sketchfab: { connected: !!sketchfab?.connected, account: '' } };
}

export class RemoteServer {
  private server: Server | null = null;
  private clients = new Set<ServerResponse>();
  port = 0;
  error: string | null = null;

  constructor(private hooks: RemoteHooks) {}

  get running() {
    return this.server !== null;
  }
  get clientCount() {
    return this.clients.size;
  }

  start(port: number) {
    this.stop();
    this.error = null;
    const srv = createServer((req, res) => this.handle(req, res));
    srv.on('error', (e: NodeJS.ErrnoException) => {
      this.error = e.code === 'EADDRINUSE' ? mt('portInUse', { port }) : e.message;
      this.server = null;
    });
    srv.listen(port, '0.0.0.0');
    this.server = srv;
    this.port = port;
  }

  stop() {
    for (const c of this.clients) c.end();
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }

  /** fan a raw packet out to every connected screen */
  packet(buf: Uint8Array) {
    if (!this.clients.size) return;
    const line = `event: packet\ndata: ${Buffer.from(buf).toString('base64')}\n\n`;
    for (const c of this.clients) c.write(line);
  }

  event(name: 'status' | 'settings', data: unknown) {
    if (!this.clients.size) return;
    if (name === 'settings') data = publicSettings(data);
    const line = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) c.write(line);
  }

  private handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = decodeURIComponent(url.pathname);
    // DNS-rebinding guard: a page on another origin that resolves to us still
    // sends its own Host header, so only answer to names we actually serve on
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    if (!new Set(['localhost', '127.0.0.1', '::1', ...this.hooks.allowedHosts()]).has(host)) {
      res.writeHead(403).end('forbidden host');
      return;
    }
    // the API also needs the per-install key from the QR code / URL
    if (path.startsWith('/api/') && !sameSecret(url.searchParams.get('k') ?? '', this.hooks.key())) {
      res.writeHead(401).end('missing or wrong key');
      return;
    }
    try {
      if (path === '/api/stream') return this.stream(req, res);
      if (path === '/api/settings' && req.method === 'GET') return json(res, publicSettings(this.hooks.getSettings()));
      if (path === '/api/settings' && req.method === 'POST') return this.postSettings(req, res);
      if (path === '/api/status') return json(res, this.hooks.getStatus());
      if (path === '/api/sessions') return json(res, this.hooks.listSessions());
      if (path.startsWith('/api/sessions/')) return file(res, this.hooks.sessionPath(path.slice(14)), 'application/octet-stream');
      if (path.startsWith('/api/models/')) return file(res, this.hooks.modelPath(path.slice(12)), 'model/gltf-binary');
      return this.static(path, res);
    } catch (e) {
      res.writeHead(500).end((e as Error).message);
    }
  }

  private stream(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: settings\ndata: ${JSON.stringify(publicSettings(this.hooks.getSettings()))}\n\n`);
    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
  }

  private postSettings(req: IncomingMessage, res: ServerResponse) {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const patch = JSON.parse(body) as Record<string, unknown>;
        const allowed = Object.fromEntries(Object.entries(patch).filter(([k]) => REMOTE_WRITABLE.has(k)));
        json(res, publicSettings(this.hooks.setSettings(allowed)));
      } catch {
        res.writeHead(400).end('bad json');
      }
    });
  }

  private static(path: string, res: ServerResponse) {
    const root = this.hooks.rendererDir;
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const full = normalize(join(root, rel));
    if (!full.startsWith(normalize(root + sep)) || !existsSync(full) || !statSync(full).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    if (rel === 'index.html') {
      // tell the page it is a remote screen of this desktop app
      const html = readFileSync(full, 'utf8').replace('<head>', '<head>\n    <meta name="fh-remote" content="1" />');
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      res.end(html);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] ?? 'application/octet-stream' });
    createReadStream(full).pipe(res);
  }
}

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return b.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

function json(res: ServerResponse, data: unknown) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(data));
}

function file(res: ServerResponse, path: string | null, type: string) {
  if (!path || !existsSync(path)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': statSync(path).size });
  createReadStream(path).pipe(res);
}
