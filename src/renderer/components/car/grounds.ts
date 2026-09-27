import * as THREE from 'three';

export type GroundId = 'wet' | 'asphalt' | 'concrete' | 'sand' | 'snow' | 'grass' | 'neon';

export const GROUND_LABELS: Record<GroundId, string> = {
  wet: 'Islak asfalt',
  asphalt: 'Kuru asfalt',
  concrete: 'Beton',
  sand: 'Çöl kumu',
  snow: 'Kar',
  grass: 'Çim',
  neon: 'Neon ızgara',
};

export interface GroundLook {
  /** metres covered by one repeat of the detail texture */
  tile: number;
  map: () => THREE.Texture;
  /** large-scale variation used as roughness (puddles, patches) */
  roughnessMap?: () => THREE.Texture;
  emissiveMap?: () => THREE.Texture;
  emissive?: string;
  color: string;
  roughness: number;
  metalness: number;
  /** 0 = matte, 1 = mirror-wet */
  reflect: number;
  mark: { color: string; opacity: number };
  smoke: [number, number, number];
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function canvas(size: number, paint: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d')!, size);
  return c;
}

function texture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Isotropic speckle: no cracks or streaks, so it never hints a direction. */
function speckle(base: string, lo: number, hi: number, tint: [number, number, number], count: number, big = 0.08) {
  return () =>
    texture(
      canvas(512, (g, s) => {
        g.fillStyle = base;
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < count; i++) {
          const v = rnd(lo, hi);
          const r = Math.random() < big ? rnd(1.4, 2.8) : rnd(0.5, 1.4);
          g.fillStyle = `rgb(${v * tint[0]},${v * tint[1]},${v * tint[2]})`;
          g.beginPath();
          g.arc(rnd(0, s), rnd(0, s), r, 0, Math.PI * 2);
          g.fill();
        }
      }),
    );
}

/** Soft blotches on grey — used as roughness so some patches shine more than others. */
function blotches(base: string, spot: string, n: number, rMin: number, rMax: number) {
  return () =>
    texture(
      canvas(256, (g, s) => {
        g.fillStyle = base;
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < n; i++) {
          const x = rnd(0, s);
          const y = rnd(0, s);
          const r = rnd(rMin, rMax);
          // draw wrapped so the texture tiles seamlessly
          for (const dx of [-s, 0, s])
            for (const dy of [-s, 0, s]) {
              const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
              grd.addColorStop(0, spot);
              grd.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = grd;
              g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
            }
        }
      }),
      false,
    );
}

function concrete() {
  return texture(
    canvas(512, (g, s) => {
      g.fillStyle = '#9a9a96';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 30000; i++) {
        const v = rnd(125, 175);
        g.fillStyle = `rgba(${v},${v},${v - 4},0.5)`;
        g.fillRect(rnd(0, s), rnd(0, s), 1.2, 1.2);
      }
      // expansion joints on the tile edges (one slab per repeat)
      g.strokeStyle = 'rgba(40,40,40,0.55)';
      g.lineWidth = 3;
      g.strokeRect(0, 0, s, s);
    }),
  );
}

function sand() {
  return texture(
    canvas(512, (g, s) => {
      g.fillStyle = '#c9a36b';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40000; i++) {
        const v = rnd(0.82, 1.12);
        g.fillStyle = `rgba(${201 * v},${163 * v},${107 * v},0.6)`;
        g.fillRect(rnd(0, s), rnd(0, s), 1, 1);
      }
    }),
  );
}

function grass() {
  return texture(
    canvas(512, (g, s) => {
      g.fillStyle = '#3f6b2a';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        const x = rnd(0, s);
        const y = rnd(0, s);
        const r = rnd(20, 70);
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, Math.random() < 0.5 ? 'rgba(95,130,45,0.5)' : 'rgba(40,70,25,0.5)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 26000; i++) {
        const v = rnd(0.7, 1.35);
        g.strokeStyle = `rgba(${70 * v},${120 * v},${45 * v},0.8)`;
        g.lineWidth = 1;
        const x = rnd(0, s);
        const y = rnd(0, s);
        const a = rnd(0, Math.PI * 2);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
        g.stroke();
      }
    }),
  );
}

function neonBase() {
  return texture(
    canvas(256, (g, s) => {
      g.fillStyle = '#07080d';
      g.fillRect(0, 0, s, s);
    }),
  );
}

function neonGlow() {
  return texture(
    canvas(512, (g, s) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, s, s);
      const line = (color: string, w: number) => {
        g.strokeStyle = color;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(s, 0);
        g.moveTo(0, 0);
        g.lineTo(0, s);
        g.stroke();
      };
      line('rgba(255,46,136,0.35)', 18);
      line('rgba(255,46,136,1)', 5);
      g.strokeStyle = 'rgba(45,226,230,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(s / 2, 0);
      g.lineTo(s / 2, s);
      g.moveTo(0, s / 2);
      g.lineTo(s, s / 2);
      g.stroke();
    }),
  );
}

export const GROUNDS: Record<GroundId, GroundLook> = {
  wet: {
    tile: 2,
    map: speckle('#5a5a5d', 50, 120, [1, 1, 1.03], 26000),
    roughnessMap: blotches('#c8c8c8', 'rgba(40,40,40,0.9)', 40, 12, 52),
    color: '#4a4c52',
    roughness: 1,
    metalness: 0.1,
    reflect: 1,
    mark: { color: '#000', opacity: 0.5 },
    smoke: [0.78, 0.8, 0.85],
  },
  asphalt: {
    tile: 2,
    map: speckle('#55565a', 45, 125, [1, 1, 1.02], 30000),
    roughnessMap: blotches('#e6e6e6', 'rgba(150,150,150,0.6)', 30, 20, 60),
    color: '#6a6b70',
    roughness: 0.95,
    metalness: 0,
    reflect: 0,
    mark: { color: '#050505', opacity: 0.55 },
    smoke: [0.82, 0.83, 0.86],
  },
  concrete: {
    tile: 4,
    map: concrete,
    roughnessMap: blotches('#dcdcdc', 'rgba(120,120,120,0.5)', 25, 20, 60),
    color: '#b8b8b4',
    roughness: 0.85,
    metalness: 0,
    reflect: 0.12,
    mark: { color: '#111', opacity: 0.45 },
    smoke: [0.85, 0.85, 0.87],
  },
  sand: {
    tile: 3,
    map: sand,
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    reflect: 0,
    mark: { color: '#6e5334', opacity: 0.45 },
    smoke: [0.8, 0.66, 0.46],
  },
  snow: {
    tile: 3,
    map: speckle('#eef3f8', 215, 255, [0.97, 0.99, 1], 30000, 0.02),
    roughnessMap: blotches('#e0e0e0', 'rgba(90,90,90,0.5)', 30, 10, 40),
    color: '#ffffff',
    roughness: 0.75,
    metalness: 0,
    reflect: 0.08,
    mark: { color: '#6f7c8a', opacity: 0.55 },
    smoke: [0.96, 0.97, 1],
  },
  grass: {
    tile: 4,
    map: grass,
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    reflect: 0,
    mark: { color: '#2a2012', opacity: 0.55 },
    smoke: [0.62, 0.55, 0.42],
  },
  neon: {
    tile: 4,
    map: neonBase,
    emissiveMap: neonGlow,
    emissive: '#ffffff',
    color: '#0b0c12',
    roughness: 0.25,
    metalness: 0.6,
    reflect: 1,
    mark: { color: '#2de2e6', opacity: 0.35 },
    smoke: [0.9, 0.55, 0.85],
  },
};
