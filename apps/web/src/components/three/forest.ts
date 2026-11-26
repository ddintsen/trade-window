// The clearing, drawn in the language of the voxel forest on docs.gno.land:
// emerald grass with a fine grain and one-voxel terraces, teal spire trees
// and round trees with a red-brown stub of trunk, a slate pond with lily
// pads, ochre and white mushrooms, and a few cherries in bloom. At dusk,
// with wind: the trees and the grass lean in gusts, petals and leaves blow
// across, mist lies on the water, fireflies drift over it.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { addSway, Bin, clamp01, grainTexture, Grid, meshGrid, PAL, pick, rng, swaying, type Wind } from "./kit";

export interface Forest {
  group: THREE.Group;
  /** Ground height (top surface) at a world position. */
  heightAt(x: number, z: number): number;
  update(time: number, dt: number, motion: boolean): void;
  dispose(): void;
}

export const T = 0.25; // a terrain voxel
export const WATER_Y = -0.14;
// The ground reaches past what any frame shows; the inner part is where
// grass, leaves and the composed trees are.
const X0 = -21;
const X1 = 21;
const Z0 = -18;
const Z1 = 9;
const INNER = { x0: -12, x1: 12, z0: -8.5, z1: 6.5 };

/** The pond: an ellipse with a ragged shore. */
export const POND = { x: 0, z: 0, a: 3.0, b: 2.1 };

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(x: number, z: number) {
  return Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.37 - 0.4) + Math.sin((x + z) * 0.19) * 0.8 + Math.cos(x * 0.53 - z * 0.21) * 0.35;
}
function pondValue(x: number, z: number) {
  return ((x - POND.x) / POND.a) ** 2 + ((z - POND.z) / POND.b) ** 2 + (hash(Math.round(x / T), Math.round(z / T)) - 0.5) * 0.14;
}
const inPond = (x: number, z: number) => pondValue(x, z) < 1;
/** The play area: the bridge, both shores and the gnomes stay flat. */
const inPlay = (x: number, z: number) => Math.abs(x) < 5.6 && z > -2.2 && z < 2.6;

/** Terrain level in voxels: negative in the pond, steps up away from the clearing. */
function level(x: number, z: number): number {
  const p = pondValue(x, z);
  if (p < 0.72) return -3;
  if (p < 1) return -1;
  if (inPlay(x, z)) return 0;
  const n = smooth(x, z) + (hash(Math.round(x / T) + 7, Math.round(z / T) - 3) - 0.5) * 0.18;
  const back = z < -3 ? (z < -5.5 ? 1.0 : 0.5) : 0;
  const v = n * 0.6 + back;
  return v > 1.15 ? 3 : v > 0.75 ? 2 : v > 0.35 ? 1 : 0;
}

interface TreeSpot {
  x: number;
  z: number;
  kind: "spire" | "round" | "blossom";
  h: number;
  r: number;
  /** Past the composed clearing: built from coarser voxels, it is always far away. */
  far?: boolean;
}

const TREES: TreeSpot[] = [
  { x: -9.6, z: -5.6, kind: "spire", h: 4.0, r: 0.62 },
  { x: -8.3, z: -3.6, kind: "spire", h: 3.0, r: 0.5 },
  { x: -6.8, z: -5.2, kind: "round", h: 2.3, r: 0.85 },
  { x: -5.3, z: -3.4, kind: "spire", h: 4.3, r: 0.66 },
  { x: -3.7, z: -5.7, kind: "spire", h: 3.5, r: 0.56 },
  { x: -2.4, z: -3.4, kind: "round", h: 1.9, r: 0.72 },
  { x: -0.7, z: -5.3, kind: "spire", h: 4.1, r: 0.62 },
  { x: 1.1, z: -3.6, kind: "spire", h: 3.2, r: 0.5 },
  { x: 2.7, z: -5.5, kind: "blossom", h: 2.8, r: 1.1 },
  { x: 4.1, z: -3.3, kind: "spire", h: 3.9, r: 0.62 },
  { x: 5.7, z: -5.3, kind: "spire", h: 3.1, r: 0.52 },
  { x: 7.1, z: -3.7, kind: "blossom", h: 2.5, r: 0.98 },
  { x: 8.5, z: -5.7, kind: "spire", h: 4.5, r: 0.68 },
  { x: 9.9, z: -3.5, kind: "spire", h: 3.2, r: 0.52 },
  { x: -10.6, z: 0.9, kind: "blossom", h: 2.4, r: 0.95 },
  { x: -8.7, z: -0.9, kind: "spire", h: 3.4, r: 0.56 },
  { x: -7.4, z: 1.5, kind: "blossom", h: 2.3, r: 0.92 },
  { x: -9.8, z: 2.3, kind: "spire", h: 3.0, r: 0.5 },
  { x: 7.6, z: -0.7, kind: "spire", h: 3.7, r: 0.6 },
  { x: 8.9, z: 1.8, kind: "round", h: 2.0, r: 0.76 },
  { x: 10.1, z: -1.9, kind: "spire", h: 2.7, r: 0.46 },
  { x: -7.2, z: 4.3, kind: "spire", h: 2.7, r: 0.5 },
  { x: 7.1, z: 4.6, kind: "spire", h: 2.5, r: 0.46 },
  { x: -9.3, z: 4.9, kind: "round", h: 1.6, r: 0.62 },
  { x: 9.5, z: 4.1, kind: "round", h: 1.7, r: 0.62 },
  { x: -2.1, z: -2.6, kind: "spire", h: 2.1, r: 0.36 },
  { x: 2.7, z: -2.5, kind: "spire", h: 2.5, r: 0.4 },
  { x: -11.0, z: -2.2, kind: "spire", h: 3.6, r: 0.58 },
  { x: 11.1, z: 0.4, kind: "spire", h: 3.3, r: 0.55 },
  // Close to the clearing, so the spires frame the trade.
  { x: -6.3, z: -2.3, kind: "spire", h: 3.4, r: 0.55 },
  { x: -5.6, z: -3.0, kind: "spire", h: 2.6, r: 0.42 },
  { x: 6.3, z: -2.4, kind: "spire", h: 3.6, r: 0.56 },
  { x: 5.5, z: -3.1, kind: "spire", h: 2.4, r: 0.4 },
  { x: -6.9, z: 0.6, kind: "spire", h: 2.9, r: 0.5 },
  { x: 7.0, z: 0.9, kind: "spire", h: 3.1, r: 0.52 },
  { x: -0.4, z: -3.0, kind: "spire", h: 2.8, r: 0.44 },
  // In the foreground, soft in the tilt-shift.
  { x: -5.0, z: 4.6, kind: "blossom", h: 2.1, r: 0.9 },
  { x: 9.2, z: 3.1, kind: "blossom", h: 2.0, r: 0.82 },
];

/** Trees past the composed clearing, so the forest has no edge in any frame. */
function fillTrees(count: number): TreeSpot[] {
  const r = rng(321);
  const out: TreeSpot[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 12000) {
    const x = X0 + 0.6 + r() * (X1 - X0 - 1.2);
    const z = Z0 + 0.6 + r() * (Z1 - Z0 - 1.2);
    const inside = x > INNER.x0 + 0.6 && x < INNER.x1 - 0.6 && z > INNER.z0 + 0.8 && z < INNER.z1 - 0.6;
    if (inside) continue;
    if ([...TREES, ...out].some((t) => Math.hypot(t.x - x, t.z - z) < 1.2)) continue;
    const k = r();
    const kind = k < 0.72 ? "spire" : k < 0.94 ? "round" : "blossom";
    out.push({ x, z, kind, h: kind === "spire" ? 2.8 + r() * 1.8 : 1.8 + r() * 0.8, r: kind === "spire" ? 0.5 + r() * 0.2 : 0.72 + r() * 0.25, far: true });
  }
  return out;
}

const TREE_VOXEL = 0.11;
const FAR_VOXEL = 0.16;

/** A spire: a rounded base that tapers to a point, or a round crown. */
function treeGrid(t: TreeSpot, seed: number, TV: number): { grid: Grid; trunk: number } {
  const g = new Grid();
  const r = rng(seed);
  const levels = Math.round(t.h / TV);
  const trunk = t.kind === "spire" ? 3 : 4;
  const pal = t.kind === "spire" ? PAL.pine : PAL.round;
  // Trunk stub.
  g.box(-1, 0, 0, trunk - 1, -1, 0, () => pick(PAL.trunk, r()));
  for (let y = 0; y < levels; y++) {
    const f = y / levels;
    let rad: number;
    if (t.kind === "spire") {
      // Swells quickly, then a long taper to the tip.
      rad = f < 0.22 ? t.r * Math.sqrt(f / 0.22) : t.r * Math.pow(1 - (f - 0.22) / 0.78, 1.15);
    } else {
      const e = (f - 0.52) / 0.5;
      rad = t.r * Math.sqrt(Math.max(0, 1 - e * e));
    }
    const rc = rad / TV;
    const span = Math.ceil(rc);
    for (let x = -span; x <= span; x++) {
      for (let z = -span; z <= span; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > rc) continue;
        // Bands of darker voxels give the stepped look of the reference.
        const band = (y + Math.round(x * 0.3)) % 5 === 0;
        const col = band ? new THREE.Color(pick(pal, r())).multiplyScalar(0.82).getHex() : pick(pal, r());
        g.set(x, y + trunk, z, col);
      }
    }
  }
  return { grid: g, trunk };
}

/**
 * A cherry in bloom: a dark trunk that bends once and forks, under a crown
 * of overlapping clumps, light on top and deeper pink underneath, with a
 * few strands hanging from its lower edge.
 */
function blossomGrid(t: TreeSpot, seed: number, TV: number): { grid: Grid; trunk: number } {
  const g = new Grid();
  const r = rng(seed);
  const trunk = Math.max(6, Math.round((t.h * 0.4) / TV));
  const bend = r() < 0.5 ? -1 : 1;
  for (let y = 0; y < trunk; y++) {
    const off = Math.round(Math.sin((y / trunk) * 1.7) * 1.4) * bend;
    g.box(off - 1, off, y, y, -1, 0, () => pick(PAL.bark, r()));
  }
  // Two branches out of the fork.
  const top = Math.round(1.4 * bend);
  for (let k = 0; k < 4; k++) {
    g.set(top + bend * (k + 1), trunk + Math.floor(k * 0.7), 0, pick(PAL.bark, r()));
    g.set(top - bend * Math.floor(k * 0.8), trunk + k, -1 - Math.floor(k / 2), pick(PAL.bark, r()));
  }
  const R = t.r / TV;
  const cx = top * 0.5;
  const cy = trunk + R * 0.42;
  // A crown of clumps around a higher middle one, each flattened, so the
  // tree reads as layered blossom rather than one ball.
  const clumps = [{ x: cx, y: cy + R * 0.3, z: 0, rx: R * 0.58, ry: R * 0.36, rz: R * 0.58 }];
  const n = 6 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.7;
    const d = R * (0.42 + r() * 0.5);
    clumps.push({ x: cx + Math.cos(a) * d, y: cy + (r() - 0.35) * R * 0.45, z: Math.sin(a) * d * 0.88, rx: R * (0.36 + r() * 0.2), ry: R * (0.24 + r() * 0.12), rz: R * (0.34 + r() * 0.2) });
  }
  const span = Math.ceil(R * 1.6);
  const yTop = Math.ceil(cy + R * 0.8);
  const yLow = Math.floor(cy - R * 0.55);
  for (let y = yLow; y <= yTop; y++) {
    for (let x = Math.floor(cx) - span; x <= Math.ceil(cx) + span; x++) {
      for (let z = -span; z <= span; z++) {
        let inside = 0;
        for (const c of clumps) {
          const d = ((x - c.x) / c.rx) ** 2 + ((y - c.y) / c.ry) ** 2 + ((z - c.z) / c.rz) ** 2;
          inside = Math.max(inside, 1 - d);
        }
        // A ragged skin: some voxels on the edge are left out.
        if (inside <= 0 || (inside < 0.14 && r() < 0.5)) continue;
        const f = (y - yLow) / Math.max(1, yTop - yLow) + (r() - 0.5) * 0.2;
        const tone = f > 0.66 ? PAL.blossom.top : f > 0.32 ? PAL.blossom.mid : PAL.blossom.low;
        g.set(x, y, z, pick(tone, r()));
      }
    }
  }
  // Strands hanging from the crown's underside.
  for (let k = 0; k < Math.round(R * 1.6); k++) {
    const a = r() * Math.PI * 2;
    const d = R * (0.45 + r() * 0.5);
    const x = Math.round(top * 0.5 + Math.cos(a) * d);
    const z = Math.round(Math.sin(a) * d * 0.9);
    const len = 1 + Math.floor(r() * 3);
    let y = yLow;
    while (y <= yTop && !g.has(x, y, z)) y++;
    if (y > yTop) continue;
    for (let j = 1; j <= len; j++) g.set(x, y - j, z, pick(PAL.blossom.low, r()));
  }
  return { grid: g, trunk };
}

/** Soft clouds of mist, tiling sideways so they can drift. */
function mistTexture(seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const r = rng(seed);
  if (ctx) {
    for (let k = 0; k < 46; k++) {
      const x = r() * w;
      const y = h * (0.2 + r() * 0.6);
      const rad = 18 + r() * 34;
      const a = 0.05 + r() * 0.09;
      // Draw each cloud three times so it tiles across the seam.
      for (const dx of [-w, 0, w]) {
        const grad = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
        grad.addColorStop(0, `rgba(255,255,255,${a})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2);
      }
    }
    // Fade the top and bottom edges so the plane has no border.
    ctx.globalCompositeOperation = "destination-in";
    const fade = ctx.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(0.3, "rgba(0,0,0,1)");
    fade.addColorStop(0.7, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createForest(wind: Wind, quality: "high" | "low"): Forest {
  const bin = new Bin();
  const group = new THREE.Group();

  // Terrain: a height field meshed face by face, coloured per voxel.
  const nx = Math.round((X1 - X0) / T);
  const nz = Math.round((Z1 - Z0) / T);
  const lv: number[] = new Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) lv[i * nz + j] = level(X0 + (i + 0.5) * T, Z0 + (j + 0.5) * T);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? -8 : lv[i * nz + j]);

  {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    const r = rng(5);
    const quad = (p: number[][], n: [number, number, number], color: THREE.Color, k: number, uvs: number[][]) => {
      const b = pos.length / 3;
      p.forEach((v, q) => {
        pos.push(v[0], v[1], v[2]);
        nor.push(...n);
        col.push(color.r * k, color.g * k, color.b * k);
        uv.push(uvs[q][0], uvs[q][1]);
      });
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const h = at(i, j);
        const x0 = X0 + i * T;
        const z0 = Z0 + j * T;
        const y = h * T;
        const top = h < 0 ? (h <= -3 ? pick(PAL.bed, r()) : pick(PAL.terrace, r())) : pick(PAL.grass, r());
        c.setHex(top);
        const g = 2.0; // grain repeats twice per unit
        quad(
          [
            [x0, y, z0 + T],
            [x0 + T, y, z0 + T],
            [x0 + T, y, z0],
            [x0, y, z0],
          ],
          [0, 1, 0],
          c,
          1,
          [
            [x0 * g, (z0 + T) * g],
            [(x0 + T) * g, (z0 + T) * g],
            [(x0 + T) * g, z0 * g],
            [x0 * g, z0 * g],
          ],
        );
        // Sides where a neighbour is lower.
        const sides: [number, number, [number, number, number]][] = [
          [1, 0, [1, 0, 0]],
          [-1, 0, [-1, 0, 0]],
          [0, 1, [0, 0, 1]],
          [0, -1, [0, 0, -1]],
        ];
        for (const [di, dj, n] of sides) {
          const hn = at(i + di, j + dj);
          if (hn >= h) continue;
          const y1 = h * T;
          const y0 = hn * T;
          c.setHex(h <= 0 && hn < 0 ? pick(PAL.bed, r()) : pick(PAL.terrace, r()));
          let p: number[][];
          if (di === 1) p = [[x0 + T, y0, z0 + T], [x0 + T, y0, z0], [x0 + T, y1, z0], [x0 + T, y1, z0 + T]];
          else if (di === -1) p = [[x0, y0, z0], [x0, y0, z0 + T], [x0, y1, z0 + T], [x0, y1, z0]];
          else if (dj === 1) p = [[x0, y0, z0 + T], [x0 + T, y0, z0 + T], [x0 + T, y1, z0 + T], [x0, y1, z0 + T]];
          else p = [[x0 + T, y0, z0], [x0, y0, z0], [x0, y1, z0], [x0 + T, y1, z0]];
          const u = (di !== 0 ? z0 : x0) * g;
          quad(p, n, c, 0.86, [
            [u, y0 * g],
            [u + T * g, y0 * g],
            [u + T * g, y1 * g],
            [u, y1 * g],
          ]);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    bin.keep(geo);
    const grain = bin.keep(grainTexture(3));
    const mat = bin.keep(new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 }));
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    group.add(ground);
  }

  const heightAt = (x: number, z: number) => at(Math.floor((x - X0) / T), Math.floor((z - Z0) / T)) * T;

  // Trees, merged into one swaying mesh.
  {
    const parts: THREE.BufferGeometry[] = [];
    const build = (t: TreeSpot, seed: number, TV: number) => {
      const { grid, trunk } = t.kind === "blossom" ? blossomGrid(t, seed, TV) : treeGrid(t, seed, TV);
      const geo = meshGrid(grid, TV, [-TV / 2, 0, -TV / 2]);
      return addSway(geo, trunk * TV, t.kind === "blossom" ? t.h * 1.1 : t.h);
    };
    TREES.forEach((t, k) => {
      const geo = build(t, 100 + k, TREE_VOXEL);
      geo.translate(t.x, heightAt(t.x, t.z), t.z);
      parts.push(geo);
    });
    const merged = bin.keep(mergeGeometries(parts, false) ?? new THREE.BufferGeometry());
    parts.forEach((p) => p.dispose());
    const mat = bin.keep(swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 }), wind, 0.16, "trees"));
    const trees = new THREE.Mesh(merged, mat);
    trees.castShadow = true;
    trees.receiveShadow = true;
    group.add(trees);

    // The far forest repeats a few shapes, drawn as instances. They are not
    // turned: the wind leans every tree the same way.
    const kinds = new Map<string, { proto: TreeSpot; seed: number; at: THREE.Matrix4[] }>();
    fillTrees(quality === "high" ? 150 : 70).forEach((t) => {
      const n = t.kind === "spire" ? 6 : 2;
      const v = Math.floor(hash(t.x * 3.1, t.z * 1.7) * n);
      const key = `${t.kind}:${v}`;
      let kind = kinds.get(key);
      if (!kind) {
        const proto: TreeSpot =
          t.kind === "spire" ? { ...t, h: 2.9 + v * 0.32, r: 0.5 + (v % 3) * 0.08 } : { ...t, h: 1.9 + v * 0.4, r: 0.78 + v * 0.1 };
        kind = { proto, seed: 500 + v + (t.kind === "spire" ? 0 : 10) + (t.kind === "blossom" ? 10 : 0), at: [] };
        kinds.set(key, kind);
      }
      kind.at.push(new THREE.Matrix4().makeTranslation(t.x, heightAt(t.x, t.z), t.z));
    });
    for (const kind of kinds.values()) {
      const geo = bin.keep(build(kind.proto, kind.seed, FAR_VOXEL));
      const far = new THREE.InstancedMesh(geo, mat, kind.at.length);
      kind.at.forEach((mm, i) => far.setMatrixAt(i, mm));
      far.computeBoundingSphere();
      far.castShadow = true;
      far.receiveShadow = true;
      group.add(far);
    }
  }

  // Mushrooms, pebbles and lily pads: one still mesh.
  {
    const r = rng(41);
    const parts: THREE.BufferGeometry[] = [];
    const MV = 0.05;
    const mushroom = (x: number, z: number, ochre: boolean, size: number) => {
      const g = new Grid();
      const stemH = 2 + size;
      g.box(0, 0, 0, stemH - 1, 0, 0, PAL.stem);
      const cap = ochre ? PAL.capOchre : PAL.capWhite;
      const w = 1 + size;
      g.box(-w, w, stemH, stemH, -w, w, () => pick(cap, r()));
      if (size > 0) g.box(-w + 1, w - 1, stemH + 1, stemH + 1, -w + 1, w - 1, () => pick(cap, r()));
      const geo = meshGrid(g, MV, [-MV / 2, 0, -MV / 2]);
      geo.translate(x, heightAt(x, z), z);
      parts.push(geo);
    };
    const pebble = (x: number, z: number, color: number) => {
      const g = new Grid();
      g.set(0, 0, 0, color);
      const geo = meshGrid(g, 0.06, [-0.03, 0, -0.03]);
      geo.translate(x, heightAt(x, z), z);
      parts.push(geo);
    };
    const clusters: [number, number][] = [
      [-6.1, -1.6],
      [5.9, 2.0],
      [-3.4, 2.7],
      [6.5, -2.0],
      [-1.4, -2.9],
      [-6.4, 2.9],
      [3.6, 2.9],
      [8.2, -1.2],
    ];
    clusters.forEach(([cx, cz], k) => {
      const n = 2 + (k % 3);
      for (let m = 0; m < n; m++) {
        const x = cx + (r() - 0.5) * 0.6;
        const z = cz + (r() - 0.5) * 0.5;
        mushroom(x, z, r() < 0.6, m === 0 ? 1 : 0);
      }
      for (let m = 0; m < 4; m++) pebble(cx + (r() - 0.5) * 1.1, cz + (r() - 0.5) * 0.9, r() < 0.5 ? PAL.capWhite[0] : PAL.capOchre[0]);
    });
    const pads: [number, number, number][] = [
      [-1.9, -1.1, 4],
      [-1.3, -1.5, 3],
      [1.7, -1.2, 4],
      [2.1, 1.2, 4],
      [-2.0, 1.3, 3],
      [0.7, 1.6, 3],
      [-0.6, -1.7, 2],
    ];
    pads.forEach(([x, z, rad]) => {
      const g = new Grid();
      for (let i = -rad; i <= rad; i++) {
        for (let k = -rad; k <= rad; k++) {
          const d = Math.hypot(i, k);
          if (d > rad + 0.3) continue;
          if (i > 0 && Math.abs(k) < 0.6) continue; // the notch
          g.set(i, 0, k, pick(PAL.pad, r()));
        }
      }
      const geo = meshGrid(g, 0.07, [-0.035, 0, -0.035]);
      geo.rotateY(r() * Math.PI * 2);
      geo.translate(x, WATER_Y - 0.03, z);
      parts.push(geo);
    });
    // Fallen petals under the cherries.
    const fallen = new Grid();
    const PV = 0.06;
    for (const t of TREES) {
      if (t.kind !== "blossom") continue;
      for (let k = 0; k < 70; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * t.r * 1.6;
        const x = t.x + Math.cos(a) * d;
        const z = t.z + Math.sin(a) * d * 0.85;
        if (inPond(x, z) || heightAt(x, z) !== heightAt(t.x, t.z)) continue;
        fallen.set(Math.round(x / PV), Math.ceil(heightAt(x, z) / (PV * 0.2)), Math.round(z / PV), pick(PAL.petal, r()));
      }
    }
    const petals = meshGrid(fallen, PV, [-PV / 2, 0, -PV / 2]);
    petals.scale(1, 0.2, 1);
    parts.push(petals);
    const merged = bin.keep(mergeGeometries(parts, false) ?? new THREE.BufferGeometry());
    parts.forEach((p) => p.dispose());
    const decor = new THREE.Mesh(merged, bin.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.3 })));
    decor.castShadow = true;
    decor.receiveShadow = true;
    group.add(decor);
  }

  // Grass tufts that bend in the wind.
  {
    const r = rng(77);
    const g = new Grid();
    g.box(0, 0, 0, 2, 0, 0, 0x3f9a6a);
    g.box(1, 1, 0, 3, 1, 1, 0x4aa877);
    g.box(-1, -1, 0, 1, 1, 1, 0x379060);
    g.box(1, 1, 0, 1, -1, -1, 0x2f8556);
    const tuft = bin.keep(meshGrid(g, 0.045, [0, 0, 0]));
    addSway(tuft, 0, 0.18);
    const spots: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let guard = 0;
    while (spots.length < (quality === "high" ? 420 : 220) && guard++ < 6000) {
      const x = INNER.x0 + 1 + r() * (INNER.x1 - INNER.x0 - 2);
      const z = INNER.z0 + 1 + r() * (INNER.z1 - INNER.z0 - 2);
      if (inPond(x, z) || pondValue(x, z) < 1.25) continue;
      if (Math.abs(x) < 4.0 && Math.abs(z) < 1.2) continue;
      if (Math.abs(Math.abs(x) - 4.3) < 0.7 && Math.abs(z) < 1.6) continue;
      if (TREES.some((t) => Math.hypot(t.x - x, t.z - z) < t.r * 0.8)) continue;
      const s = 0.7 + r() * 0.8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(s, s * (0.8 + r() * 0.6), s));
      spots.push(m.clone());
    }
    const mat = bin.keep(swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }), wind, 0.09, "tufts"));
    const tufts = new THREE.InstancedMesh(tuft, mat, spots.length);
    spots.forEach((mm, i) => tufts.setMatrixAt(i, mm));
    tufts.receiveShadow = true;
    group.add(tufts);
  }

  // Water: a mirror at dusk, dark slate, with a slow ripple.
  let waterTime: { value: number } | null = null;
  {
    const w = POND.a * 2 + 0.6;
    const d = POND.b * 2 + 0.6;
    const plane = bin.keep(new THREE.PlaneGeometry(w, d));
    if (quality === "high") {
      const mirror = new Reflector(plane, {
        clipBias: 0.003,
        textureWidth: 1024,
        textureHeight: 512,
        color: 0x2a4050,
        shader: {
          name: "PondShader",
          uniforms: {
            color: { value: null },
            tDiffuse: { value: null },
            textureMatrix: { value: null },
            time: { value: 0 },
            water: { value: new THREE.Color(0x203644) },
          },
          vertexShader: /* glsl */ `
            uniform mat4 textureMatrix;
            varying vec4 vUv;
            varying vec3 vWorld;
            #include <common>
            #include <logdepthbuf_pars_vertex>
            void main() {
              vUv = textureMatrix * vec4(position, 1.0);
              vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              #include <logdepthbuf_vertex>
            }`,
          fragmentShader: /* glsl */ `
            uniform sampler2D tDiffuse;
            uniform float time;
            uniform vec3 water;
            varying vec4 vUv;
            varying vec3 vWorld;
            #include <logdepthbuf_pars_fragment>
            void main() {
              #include <logdepthbuf_fragment>
              vec2 ripple = vec2(
                sin(vWorld.z * 7.0 + time * 1.3) + sin(vWorld.x * 5.0 - time * 0.9),
                cos(vWorld.z * 6.0 - time * 1.1) + cos(vWorld.x * 4.0 + time * 0.7)
              ) * 0.0035;
              vec4 uv = vUv;
              uv.xy += ripple * uv.w;
              vec3 reflected = texture2DProj(tDiffuse, uv).rgb;
              vec3 c = mix(water, reflected * vec3(0.78, 0.9, 0.95), 0.5);
              gl_FragColor = vec4(c, 1.0);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        },
      });
      // Reflector clones the uniforms; keep a handle on its own copy.
      waterTime = (mirror.material as THREE.ShaderMaterial).uniforms.time;
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.set(POND.x, WATER_Y, POND.z);
      group.add(mirror);
      bin.keep({ dispose: () => mirror.dispose() });
    } else {
      const mat = bin.keep(new THREE.MeshStandardMaterial({ color: 0x223a48, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.2 }));
      const flat = new THREE.Mesh(plane, mat);
      flat.rotation.x = -Math.PI / 2;
      flat.position.set(POND.x, WATER_Y, POND.z);
      flat.receiveShadow = true;
      group.add(flat);
    }
  }

  // Mist on the water and in the hollows behind it, drifting with the wind.
  const mists: { tex: THREE.Texture; speed: number }[] = [];
  {
    const base = bin.keep(mistTexture(7));
    const spots: [number, number, number, number, number, number, number][] = [
      // x, y, z, width, depth, opacity, drift
      [0, WATER_Y + 0.1, 0.15, POND.a * 2.7, POND.b * 2.3, 0.3, 0.012],
      [-4.2, 0.34, -4.7, 10, 3.4, 0.2, 0.008],
      [4.8, 0.4, -5.1, 10, 3.2, 0.18, 0.01],
      [0, 0.62, -8.2, 22, 4.5, 0.22, 0.006],
    ];
    spots.forEach(([x, y, z, w, d, opacity, speed], k) => {
      const tex = bin.keep(base.clone());
      tex.offset.x = k * 0.37;
      tex.repeat.x = w / 9;
      const mat = bin.keep(new THREE.MeshBasicMaterial({ map: tex, color: 0xb4ccd0, transparent: true, opacity, depthWrite: false }));
      const plane = new THREE.Mesh(bin.keep(new THREE.PlaneGeometry(w, d)), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(x, y, z);
      plane.renderOrder = 2;
      group.add(plane);
      mists.push({ tex, speed });
    });
  }

  // Glints on the water, like the white dashes in the reference.
  const glints: { x: number; z: number; p: number; s: number }[] = [];
  {
    const r = rng(88);
    while (glints.length < 26) {
      const x = POND.x + (r() - 0.5) * POND.a * 1.7;
      const z = POND.z + (r() - 0.5) * POND.b * 1.7;
      if (pondValue(x, z) > 0.8 || Math.abs(z) < 0.95) continue;
      glints.push({ x, z, p: r() * Math.PI * 2, s: 0.6 + r() * 1.2 });
    }
  }
  const glintGeo = bin.keep(new THREE.PlaneGeometry(0.11, 0.022));
  glintGeo.rotateX(-Math.PI / 2);
  const glintMat = bin.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const glintMesh = new THREE.InstancedMesh(glintGeo, glintMat, glints.length);
  glintMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(glints.length * 3), 3);
  group.add(glintMesh);

  // Leaves on the wind, and fireflies over the water.
  const r = rng(99);
  const leafGeo = bin.keep(new THREE.BoxGeometry(0.1, 0.014, 0.075));
  const leafMat = bin.keep(new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, side: THREE.DoubleSide, emissive: 0x16261c, emissiveIntensity: 0.6 }));
  const LEAVES = quality === "high" ? 110 : 55;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES);
  leaves.castShadow = false;
  const leafState = Array.from({ length: LEAVES }, () => ({
    x: INNER.x0 + r() * (INNER.x1 - INNER.x0),
    y: 0.5 + r() * 4,
    z: INNER.z0 + 1 + r() * (INNER.z1 - INNER.z0 - 2),
    vy: 0.25 + r() * 0.35,
    spin: new THREE.Vector3(r(), r(), r()).normalize(),
    a: r() * Math.PI * 2,
    p: r() * Math.PI * 2,
  }));
  const c = new THREE.Color();
  // Mostly petals from the cherries, some leaves.
  leafState.forEach((_, i) => leaves.setColorAt(i, c.setHex(r() < 0.62 ? pick(PAL.petal, r()) : pick(PAL.leaf, r()))));
  group.add(leaves);

  const flyGeo = bin.keep(new THREE.BoxGeometry(0.035, 0.035, 0.035));
  const flyMat = bin.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 1.1), toneMapped: false }));
  const FLIES = 18;
  const flies = new THREE.InstancedMesh(flyGeo, flyMat, FLIES);
  const flyState = Array.from({ length: FLIES }, () => {
    const a = r() * Math.PI * 2;
    const d = 2 + r() * 5;
    return { x: Math.cos(a) * d * 1.3, y: 0.4 + r() * 1.6, z: Math.sin(a) * d * 0.7 - 0.5, rad: 0.3 + r() * 0.5, s: 0.2 + r() * 0.4, p: r() * Math.PI * 2 };
  });
  group.add(flies);

  const dummy = new THREE.Object3D();
  const axis = new THREE.Vector3();

  function update(time: number, dt: number, motion: boolean) {
    if (waterTime) waterTime.value = time;
    for (const m of mists) m.tex.offset.x += m.speed * dt * (0.4 + wind.uWind.value);
    const windNow = wind.uWind.value;
    // Leaves blow along +x in gusts and tumble down; they start again upwind.
    leafState.forEach((l, i) => {
      if (motion) {
        const gust = 0.6 + 0.4 * Math.sin(time * 0.5 + l.x * 0.06);
        l.x += (0.9 + Math.sin(time * 1.3 + l.p) * 0.4) * gust * windNow * dt;
        l.z += Math.sin(time * 0.9 + l.p) * 0.25 * dt;
        l.y -= l.vy * dt * (0.7 + 0.3 * Math.sin(time * 2.0 + l.p));
        l.a += dt * (2 + l.vy * 4);
        if (l.y < heightAt(l.x, l.z) + 0.02 || l.x > INNER.x1 - 0.5) {
          l.x = INNER.x0 + 0.5 + r() * 6;
          l.y = 2.5 + r() * 2.5;
          l.z = INNER.z0 + 1 + r() * (INNER.z1 - INNER.z0 - 2);
        }
      }
      dummy.position.set(l.x, l.y, l.z);
      axis.copy(l.spin);
      dummy.quaternion.setFromAxisAngle(axis, l.a);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    });
    leaves.instanceMatrix.needsUpdate = true;

    flyState.forEach((f, i) => {
      const t = motion ? time * f.s + f.p : f.p;
      dummy.position.set(f.x + Math.cos(t) * f.rad, f.y + Math.sin(t * 1.4) * 0.2, f.z + Math.sin(t) * f.rad);
      dummy.quaternion.identity();
      const blink = motion ? clamp01(0.5 + Math.sin(time * (1.5 + f.s) + f.p * 3) * 0.8) : 1;
      dummy.scale.setScalar(Math.max(0.05, blink));
      dummy.updateMatrix();
      flies.setMatrixAt(i, dummy.matrix);
    });
    flies.instanceMatrix.needsUpdate = true;

    glints.forEach((g, i) => {
      const tw = motion ? Math.max(0, Math.sin(time * g.s + g.p)) : 0.6;
      dummy.position.set(g.x, WATER_Y + 0.004, g.z);
      dummy.quaternion.identity();
      dummy.scale.set(0.6 + tw * 0.6, 1, 1);
      dummy.updateMatrix();
      glintMesh.setMatrixAt(i, dummy.matrix);
      glintMesh.setColorAt(i, c.setScalar(tw * 0.55));
    });
    glintMesh.instanceMatrix.needsUpdate = true;
    if (glintMesh.instanceColor) glintMesh.instanceColor.needsUpdate = true;
  }
  update(0, 0, false);

  return {
    group,
    heightAt,
    update,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      bin.dispose();
    },
  };
}
