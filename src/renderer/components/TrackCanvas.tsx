import { useEffect, useRef } from 'react';
import { store, type TrailPoint } from '../store';

export type ColorMode = 'speed' | 'pedals' | 'plain';

// Perceptually ordered ramp (dark violet → pink → orange → yellow), plasma-like.
const RAMP = ['#3b1c8c', '#6a1fa0', '#9c2a9a', '#c83d86', '#e8586b', '#f97d4f', '#fca636', '#f6d42c'];
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RAMP_RGB = RAMP.map(hex);
const BUCKETS = 24;
const BUCKET_COLORS = Array.from({ length: BUCKETS }, (_, i) => {
  const t = (i / (BUCKETS - 1)) * (RAMP_RGB.length - 1);
  const a = RAMP_RGB[Math.floor(t)];
  const b = RAMP_RGB[Math.min(RAMP_RGB.length - 1, Math.floor(t) + 1)];
  const k = t - Math.floor(t);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`;
});
export const SPEED_RAMP_CSS = `linear-gradient(90deg, ${RAMP.join(',')})`;

export interface View {
  cx: number;
  cz: number;
  /** pixels per meter */
  scale: number;
}

interface Props {
  colorBy?: ColorMode;
  follow?: boolean;
  /** initial / follow zoom in px per meter */
  zoom?: number;
  interactive?: boolean;
  /** fixed max speed for the ramp; defaults to session max */
  speedMax?: number;
  /** extra polylines (e.g. lap overlays) in world coords */
  overlays?: { points: { x: number; z: number }[]; color: string; width?: number }[];
  showCar?: boolean;
  showTrail?: boolean;
  onViewChange?: (v: View) => void;
  viewRef?: React.MutableRefObject<{ fit: () => void; setFollow: (f: boolean) => void } | null>;
  style?: React.CSSProperties;
}

function bounds(points: { x: number; z: number }[]) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function TrackCanvas({ colorBy = 'speed', follow = false, zoom = 1, interactive = true, speedMax, overlays, showCar = true, showTrail = true, viewRef, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ cx: 0, cz: 0, scale: zoom });
  const followRef = useRef(follow);
  const fitted = useRef(false);
  const dirty = useRef(true);
  const propsRef = useRef({ colorBy, speedMax, overlays, showCar, showTrail });
  propsRef.current = { colorBy, speedMax, overlays, showCar, showTrail };

  useEffect(() => {
    followRef.current = follow;
    dirty.current = true;
  }, [follow]);
  useEffect(() => {
    dirty.current = true;
  }, [colorBy, speedMax, overlays]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let lastVersion = -1;
    let w = 0;
    let h = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      dirty.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const fit = () => {
      const pts: { x: number; z: number }[] = propsRef.current.showTrail && store.trail.length > 1 ? store.trail : (propsRef.current.overlays?.flatMap((o) => o.points) ?? []);
      if (pts.length < 2 || !w) return;
      const b = bounds(pts);
      const sx = (w - 60) / Math.max(50, b.maxX - b.minX);
      const sz = (h - 60) / Math.max(50, b.maxZ - b.minZ);
      view.current = { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, scale: Math.min(sx, sz) };
      dirty.current = true;
    };
    if (viewRef)
      viewRef.current = {
        fit: () => {
          followRef.current = false;
          fit();
        },
        setFollow: (f) => {
          followRef.current = f;
          dirty.current = true;
        },
      };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (store.version === lastVersion && !dirty.current) return;
      lastVersion = store.version;
      dirty.current = false;
      const { colorBy, speedMax, overlays, showCar, showTrail } = propsRef.current;
      const trail = showTrail ? store.trail : [];
      const f = store.frame;

      if (!fitted.current && !followRef.current && (trail.length > 20 || overlays?.length)) {
        fit();
        fitted.current = true;
      }
      const v = view.current;
      if (followRef.current && f) {
        v.cx = f.positionX;
        v.cz = f.positionZ;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // background grid (100 m)
      const gridStep = v.scale > 0.6 ? 100 : v.scale > 0.06 ? 1000 : 10000;
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = v.cx - w / 2 / v.scale;
      const x1 = v.cx + w / 2 / v.scale;
      const z0 = v.cz - h / 2 / v.scale;
      const z1 = v.cz + h / 2 / v.scale;
      for (let gx = Math.floor(x0 / gridStep) * gridStep; gx <= x1; gx += gridStep) {
        const sx = (gx - v.cx) * v.scale + w / 2;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }
      for (let gz = Math.floor(z0 / gridStep) * gridStep; gz <= z1; gz += gridStep) {
        const sy = -(gz - v.cz) * v.scale + h / 2;
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
      ctx.stroke();

      const toS = (x: number, z: number): [number, number] => [(x - v.cx) * v.scale + w / 2, -(z - v.cz) * v.scale + h / 2];

      // trail, batched by color bucket, decimated to ~1px and culled to the viewport
      const vmax = speedMax ?? Math.max(10, store.maxSpeed);
      const lw = Math.max(2, Math.min(6, v.scale * 3));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const paths = new Map<string, Path2D>();
      const colorOf = (p: TrailPoint) => {
        if (colorBy === 'plain') return '#ff2e88';
        if (colorBy === 'pedals') return p.brake > 0.05 ? '#ff4d5e' : p.throttle > 0.05 ? '#3bdc84' : '#6b7285';
        return BUCKET_COLORS[Math.min(BUCKETS - 1, Math.floor((p.speed / vmax) * BUCKETS))];
      };
      let prev: [number, number] | null = null;
      let prevP: TrailPoint | null = null;
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const s = toS(p.x, p.z);
        if (prev && prevP) {
          const dx = s[0] - prev[0];
          const dy = s[1] - prev[1];
          if (dx * dx + dy * dy < 1.5 && i < trail.length - 1) continue;
          const jump = Math.hypot(p.x - prevP.x, p.z - prevP.z) > 60; // teleport
          const vis = !((s[0] < -20 && prev[0] < -20) || (s[0] > w + 20 && prev[0] > w + 20) || (s[1] < -20 && prev[1] < -20) || (s[1] > h + 20 && prev[1] > h + 20));
          if (!jump && vis) {
            const col = colorOf(p);
            let path = paths.get(col);
            if (!path) paths.set(col, (path = new Path2D()));
            path.moveTo(prev[0], prev[1]);
            path.lineTo(s[0], s[1]);
          }
        }
        prev = s;
        prevP = p;
      }
      ctx.lineWidth = lw;
      for (const [col, path] of paths) {
        ctx.strokeStyle = col;
        ctx.stroke(path);
      }

      for (const o of overlays ?? []) {
        ctx.strokeStyle = o.color;
        ctx.lineWidth = o.width ?? 2;
        ctx.beginPath();
        o.points.forEach((p, i) => {
          const s = toS(p.x, p.z);
          if (i) ctx.lineTo(s[0], s[1]);
          else ctx.moveTo(s[0], s[1]);
        });
        ctx.stroke();
      }

      if (showCar && f && f.isRaceOn) {
        const [sx, sy] = toS(f.positionX, f.positionZ);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(f.yaw);
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
        glow.addColorStop(0, 'rgba(255,255,255,0.35)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#0e1016';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(7.5, 8);
        ctx.lineTo(0, 4);
        ctx.lineTo(-7.5, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // scale bar
      if (interactive) {
        const target = 120 / v.scale;
        const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((n) => n >= target) ?? 10000;
        const px = nice * v.scale;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(16, h - 20, px, 2);
        ctx.font = '11px "JetBrains Mono Variable", monospace';
        ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 16, h - 26);
      }
    };
    raf = requestAnimationFrame(draw);

    // interaction
    let drag: { x: number; y: number; cx: number; cz: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (!interactive) return;
      followRef.current = false;
      drag = { x: e.clientX, y: e.clientY, cx: view.current.cx, cz: view.current.cz };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      view.current.cx = drag.cx - (e.clientX - drag.x) / view.current.scale;
      view.current.cz = drag.cz + (e.clientY - drag.y) / view.current.scale;
      dirty.current = true;
    };
    const onUp = () => (drag = null);
    const onWheel = (e: WheelEvent) => {
      if (!interactive) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left - w / 2;
      const my = e.clientY - r.top - h / 2;
      const v = view.current;
      const k = Math.exp(-e.deltaY * 0.0015);
      const ns = Math.max(0.002, Math.min(40, v.scale * k));
      if (!followRef.current) {
        v.cx += mx / v.scale - mx / ns;
        v.cz -= my / v.scale - my / ns;
      }
      v.scale = ns;
      dirty.current = true;
    };
    const onDbl = () => {
      followRef.current = false;
      fit();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
    };
  }, [interactive, viewRef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: interactive ? 'grab' : 'default', ...style }} />;
}
