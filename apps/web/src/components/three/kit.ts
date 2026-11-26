// Shared pieces of the trade scene: easing, seeded noise, the palette,
// matte voxel models merged into one mesh each, and stencilled labels.
// The look follows gno.land's own voxel pictures: slate-blue land, dark
// water, terracotta wood, soft light and no glow. Loaded only with a scene.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type Side = "maker" | "taker";

/**
 * sRGB hex colours, after the voxel forest on docs.gno.land: emerald grass,
 * teal spires, slate water, ochre and white mushrooms, a red-brown trunk
 * stub. Side colours only mark caps and lanterns.
 */
export const PAL = {
  sky: 0x0b1614,
  fog: 0x0d1916,
  grass: [0x1d6b4a, 0x1f7050, 0x1b6646, 0x22754f, 0x1e6c4b, 0x206e4d],
  terrace: [0x175a3e, 0x16553b, 0x185c40],
  bed: [0x223747, 0x203445, 0x26404f],
  pine: [0x1e5c52, 0x22665a, 0x1b5449, 0x246b5e],
  round: [0x1f6656, 0x23705f, 0x1c5e50],
  trunk: [0x5a2418, 0x4e1f15],
  pad: [0x1f6a5c, 0x237565, 0x1b5f52],
  capOchre: [0xc99a5f, 0xb98a52, 0xd4a66a],
  capWhite: [0xe8ebe9, 0xd6dbd8],
  stem: 0xe2ddd2,
  leaf: [0x4f9a6a, 0x63ad74, 0x3d8a66, 0xd8aa62, 0xa9cc72, 0xe0bf7a],
  // Cherry in bloom, after the blossom forests of voxel games: light tops,
  // deeper pink underneath, a dark bark.
  blossom: { top: [0xf1b5cb, 0xeca6c0, 0xf5c3d5], mid: [0xdf87ab, 0xd97ba3, 0xe493b4], low: [0xb85a83, 0xa94f78, 0xc0658c] },
  bark: [0x3a2420, 0x452a22, 0x31201b],
  petal: [0xf6c4d6, 0xefa8c4, 0xfadbe6, 0xe58fb3],
  wood: [0x8a4a2c, 0x955233, 0x7d4228, 0x9c5a38],
  woodDark: [0x5e3220, 0x542c1c, 0x663824],
  crate: [0xd2ad74, 0xc8a067, 0xdab77f],
  crateFrame: [0x6b4426, 0x5e3a20],
  brass: 0xe0b85c,
  brassDark: 0xa57c34,
  iron: 0x26292b,
  beard: [0xcfd4d9, 0xc2c8ce, 0xd8dce0],
  skin: 0xd6a088,
  nose: 0xe0907a,
  boots: 0x2a2523,
  hat: { maker: [0xc4843c, 0xb87732, 0xcf9149], taker: [0x3b9aa1, 0x328b92, 0x47a8ae] },
  coat: { maker: 0x4a3526, taker: 0x253f47 },
  lamp: { maker: 0xffb15c, taker: 0x74d3da },
  rug: { maker: [0x9a5a26, 0xb06d30, 0x7f4a20], taker: [0x1f6a70, 0x2a7f86, 0x195a5f] },
} as const;

/** Seeded so a scene looks the same on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** CSS cubic-bezier as a function of x in [0, 1]. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

export const easeMove = bezier(0.76, 0, 0.24, 1);
export const easeOut = bezier(0.23, 1, 0.32, 1);
export const easeIn = bezier(0.55, 0, 0.9, 0.4);

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Progress of t through [a, b]. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent approach of a value to its target. */
export const damp = (value: number, target: number, rate: number, dt: number) => target + (value - target) * Math.exp(-rate * dt);
/** Arrival with a small overshoot. */
export function backOut(t: number, s = 1.6) {
  const u = clamp01(t) - 1;
  return 1 + u * u * ((s + 1) * u + s);
}

/** Disposes everything handed to it, once. */
export class Bin {
  private items: { dispose(): void }[] = [];
  keep<T extends { dispose(): void }>(x: T): T {
    this.items.push(x);
    return x;
  }
  dispose() {
    this.items.forEach((x) => x.dispose());
    this.items = [];
  }
}

/** One box of a voxel model: centre, size, sRGB colour. */
export type Vox = [x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number];

const tmpColor = new THREE.Color();

/** Boxes merged into one geometry with their colours in the vertices. */
export function voxels(list: Vox[]): THREE.BufferGeometry {
  const parts = list.map(([x, y, z, sx, sy, sz, c]) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    tmpColor.setHex(c);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/** The matte material every voxel model shares. */
export function matte(roughness = 0.86): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, envMapIntensity: 0.35 });
}

/** A dim night for the few things that reflect: water, brass. */
export function nightEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(20, 32, 16);
  const pos = geo.attributes.position;
  const top = new THREE.Color(0x3a5068);
  const bottom = new THREE.Color(0x070b10);
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 20;
    c.copy(bottom).lerp(top, Math.pow((y + 1) / 2, 1.6));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.1), side: THREE.DoubleSide }));
  moon.position.set(-8, 12, -6);
  moon.lookAt(0, 0, 0);
  env.add(moon);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  env.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return texture;
}

/** The page's sans, as a canvas needs it (next/font gives it a generated name). */
export function pageFont(): string {
  try {
    return getComputedStyle(document.body).fontFamily || "ui-sans-serif, system-ui, sans-serif";
  } catch {
    return "ui-sans-serif, system-ui, sans-serif";
  }
}

/** A stencilled word, for a crate side or a coin face. */
export function labelTexture(text: string, font: string, color: string, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let px = size * 0.36;
    ctx.font = `800 ${px}px ${font}`;
    const max = size * 0.8;
    const w = ctx.measureText(text).width;
    if (w > max) {
      px = Math.max(size * 0.14, (px * max) / w);
      ctx.font = `800 ${px}px ${font}`;
    }
    ctx.fillText(text, size / 2, size / 2 + px * 0.05);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function pick<T>(list: readonly T[], r: number): T {
  return list[Math.floor(r * list.length) % list.length];
}

/** A voxel grid: integer cells to sRGB colours. */
/** The six faces of a voxel: outward normal and corners, counter-clockwise from outside. */
const FACES: { n: [number, number, number]; corners: [number, number, number][] }[] = [
  { n: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

// Cells pack into one small integer, so a grid is a Map of numbers: much
// faster to build and mesh than string keys. Each axis spans -512..511.
const GRID_OFF = 512;
const GRID_N = 1024;
const pack = (x: number, y: number, z: number) => ((x + GRID_OFF) * GRID_N + (y + GRID_OFF)) * GRID_N + (z + GRID_OFF);

export class Grid {
  cells = new Map<number, number>();
  set(x: number, y: number, z: number, color: number) {
    this.cells.set(pack(x, y, z), color);
  }
  has(x: number, y: number, z: number) {
    return this.cells.has(pack(x, y, z));
  }
  /** Fills a box of cells, inclusive; colour may vary per cell. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number | ((x: number, y: number, z: number) => number)) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, typeof color === "number" ? color : color(x, y, z));
  }
}

export function meshGrid(grid: Grid, size: number, origin: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  // First pass: which faces are exposed.
  const cells = grid.cells;
  const exposed: number[] = []; // key, colour, face index, repeated
  for (const [key, color] of cells) {
    const z = (key % GRID_N) - GRID_OFF;
    const y = (Math.floor(key / GRID_N) % GRID_N) - GRID_OFF;
    const x = Math.floor(key / (GRID_N * GRID_N)) - GRID_OFF;
    for (let f = 0; f < FACES.length; f++) {
      const n = FACES[f].n;
      if (cells.has(pack(x + n[0], y + n[1], z + n[2]))) continue;
      exposed.push(key, color, f);
    }
  }
  // Second pass: write the quads straight into typed arrays.
  const faces = exposed.length / 3;
  const pos = new Float32Array(faces * 12);
  const nor = new Float32Array(faces * 12);
  const col = new Float32Array(faces * 12);
  const idx = faces * 4 > 65535 ? new Uint32Array(faces * 6) : new Uint16Array(faces * 6);
  const c = new THREE.Color();
  for (let i = 0; i < faces; i++) {
    const key = exposed[i * 3];
    const z = (key % GRID_N) - GRID_OFF;
    const y = (Math.floor(key / GRID_N) % GRID_N) - GRID_OFF;
    const x = Math.floor(key / (GRID_N * GRID_N)) - GRID_OFF;
    c.setHex(exposed[i * 3 + 1]);
    const face = FACES[exposed[i * 3 + 2]];
    // A touch of ambient occlusion: faces pointing down are darker.
    const k = face.n[1] < 0 ? 0.7 : face.n[1] > 0 ? 1.0 : 0.88;
    for (let v = 0; v < 4; v++) {
      const [cx, cy, cz] = face.corners[v];
      const o = i * 12 + v * 3;
      pos[o] = (x + cx) * size + origin[0];
      pos[o + 1] = (y + cy) * size + origin[1];
      pos[o + 2] = (z + cz) * size + origin[2];
      nor[o] = face.n[0];
      nor[o + 1] = face.n[1];
      nor[o + 2] = face.n[2];
      col[o] = c.r * k;
      col[o + 1] = c.g * k;
      col[o + 2] = c.b * k;
    }
    const b = i * 4;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

export interface Wind {
  uTime: { value: number };
  uWind: { value: number };
}

/**
 * Wind in the vertex shader. Geometry carries a `sway` attribute: 0 where
 * it is rooted, 1 at its tip. Everything bends by where it stands, so a
 * gust rolls across the forest instead of shaking it all at once.
 */
export function swaying<T extends THREE.Material>(material: T, wind: Wind, amplitude: number, key: string): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uWind = wind.uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float sway;\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vec4 wpos = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wpos = instanceMatrix * wpos;
      #endif
      wpos = modelMatrix * wpos;
      float phase = wpos.x * 0.45 + wpos.z * 0.3;
      float gust = sin(uTime * 0.5 + wpos.x * 0.06 - wpos.z * 0.04) * 0.5 + 0.5;
      float k = sway * sway * ${amplitude.toFixed(4)} * uWind * (0.35 + 0.65 * gust);
      transformed.x += (sin(uTime * 1.6 + phase) * 0.6 + sin(uTime * 3.1 + phase * 1.7) * 0.2 + 0.4) * k;
      transformed.z += cos(uTime * 1.3 + phase * 1.2) * 0.35 * k;`,
      );
  };
  material.customProgramCacheKey = () => `sway-${key}`;
  return material;
}

/** A sway attribute from height: 0 at `base`, 1 at `base + height`. */
export function addSway(geometry: THREE.BufferGeometry, base: number, height: number) {
  const pos = geometry.attributes.position;
  const sway = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) sway[i] = clamp01((pos.getY(i) - base) / height);
  geometry.setAttribute("sway", new THREE.BufferAttribute(sway, 1));
  return geometry;
}

/** A soft round glow, for the light around a lantern. */
export function haloTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.18, "rgba(255,255,255,0.42)");
    g.addColorStop(0.45, "rgba(255,255,255,0.1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Fine grain for the grass, like the noise of a rendered voxel field. */
export function grainTexture(seed = 3): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = rng(seed);
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = Math.round(255 * (0.84 + r() * 0.16));
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
