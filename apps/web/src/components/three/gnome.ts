// A voxel gnome, read like gno.land's own: a tall leaning cap and a big
// beard, no face to speak of. The cap is in its side's colour. It breathes,
// its cap sways in the wind, and it hops when something good happens.
// Faces +z; its origin is between its boots.

import * as THREE from "three";
import { Grid, meshGrid, PAL, pick, rng, type Side } from "./kit";

export interface Gnome {
  root: THREE.Group;
  /** Where a nameplate hangs, in the gnome's own space. */
  readonly plateHeight: number;
  setPresent(present: boolean, instant?: boolean): void;
  hop(height?: number): void;
  /** `animate` plays arrivals and hops; `idle` breathes and sways the cap. */
  update(dt: number, time: number, animate: boolean, idle: boolean): void;
  dispose(): void;
}

const V = 0.075; // one voxel

/** Where a nameplate hangs: a little above the tip of the cap. */
export const PLATE_HEIGHT = 2.55;

function bodyGrid(side: Side, seed: number): Grid {
  const r = rng(seed);
  const g = new Grid();
  const vary = (list: readonly number[]) => () => pick(list, r());
  // Boots.
  g.box(-3, -1, 0, 1, -1, 2, () => (r() < 0.2 ? 0x3a312c : PAL.boots));
  g.box(1, 3, 0, 1, -1, 2, () => (r() < 0.2 ? 0x3a312c : PAL.boots));
  // Coat: wide at the hem, narrower up top, a belt with a buckle.
  const coat = PAL.coat[side];
  const coatTone = (k: number) => new THREE.Color(coat).multiplyScalar(k).getHex();
  const coatVary = () => (r() < 0.25 ? coatTone(1.12) : r() < 0.2 ? coatTone(0.9) : coat);
  g.box(-4, 4, 2, 5, -3, 3, coatVary);
  g.box(-3, 3, 6, 9, -3, 2, coatVary);
  g.box(-4, 4, 5, 5, -3, 3, 0x2a221c);
  g.box(0, 0, 5, 5, 4, 4, PAL.brass);
  // Arms and hands.
  for (const s of [-1, 1]) {
    g.box(4 * s, 4 * s, 6, 9, -1, 1, coatVary);
    g.box(5 * s, 5 * s, 4, 8, -1, 1, coatVary);
    g.box(5 * s, 5 * s, 3, 3, -1, 1, PAL.skin);
  }
  // Head, mostly hidden by the beard and the cap.
  g.box(-3, 3, 10, 13, -3, 2, PAL.skin);
  // The beard: a broad fall over the chest, narrowing to a point.
  const beard = vary(PAL.beard);
  const rows: [number, number][] = [
    [13, 3],
    [12, 3],
    [11, 4],
    [10, 4],
    [9, 4],
    [8, 3],
    [7, 3],
    [6, 2],
    [5, 1],
    [4, 1],
    [3, 0],
  ];
  for (const [y, w] of rows) {
    g.box(-w, w, y, y, 3, 3, beard);
    if (y >= 9) g.box(-w, w, y, y, 2, 2, beard);
  }
  for (const s of [-1, 1]) g.box(3 * s, 3 * s, 10, 13, -1, 2, beard);
  // The nose sits on the beard.
  g.box(-1, 1, 12, 13, 4, 4, PAL.nose);
  g.box(0, 0, 12, 12, 5, 5, PAL.nose);
  return g;
}

/**
 * The cap: one voxel per tier, narrowing slowly and leaning back and a
 * little to the side towards the tip, with its corners rounded off.
 */
const CAP: { y: number; w: number; cx: number; cz: number }[] = [];
{
  const widths = [4.6, 4.2, 3.7, 3.5, 3.2, 3.0, 2.7, 2.5, 2.2, 2.0, 1.7, 1.5, 1.2, 1.0, 0.7, 0.5, 0.3];
  widths.forEach((w, i) => {
    const lean = Math.max(0, i - 5);
    CAP.push({ y: 14 + i, w, cx: -lean * 0.14, cz: -0.4 - lean * 0.34 });
  });
}
const CAP_SPLIT = 6; // tiers below sit on the head; the rest sway

function capGrid(side: Side, seed: number, from: number, to: number): Grid {
  const r = rng(seed + 9);
  const g = new Grid();
  const hat = () => pick(PAL.hat[side], r());
  CAP.slice(from, to).forEach((t) => {
    const span = Math.ceil(t.w + 1);
    for (let x = -span; x <= span; x++) {
      for (let z = -span; z <= span; z++) {
        const dx = Math.abs(x - t.cx);
        const dz = Math.abs(z - t.cz);
        if (dx > t.w || dz > t.w) continue;
        // Round the corners of the wider tiers.
        if (t.w >= 2 && dx > t.w - 1 && dz > t.w - 1) continue;
        g.set(x, t.y, z, hat());
      }
    }
  });
  return g;
}

export function createGnome(side: Side, material: THREE.Material, seed = 0): Gnome {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const origin: [number, number, number] = [-V / 2, 0, -V / 2];
  const bodyGeo = meshGrid(bodyGrid(side, seed), V, origin);
  const bodyMesh = new THREE.Mesh(bodyGeo, material);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  body.add(bodyMesh);

  // The cap: a lower part on the head, an upper part that sways.
  const lowGeo = meshGrid(capGrid(side, seed, 0, CAP_SPLIT), V, origin);
  const lowMesh = new THREE.Mesh(lowGeo, material);
  lowMesh.castShadow = true;
  lowMesh.receiveShadow = true;
  body.add(lowMesh);
  const pivot = new THREE.Group();
  const py = 14 + CAP_SPLIT;
  pivot.position.set(0, py * V, -0.4 * V);
  const highGeo = meshGrid(capGrid(side, seed, CAP_SPLIT, CAP.length), V, [origin[0], origin[1] - py * V, origin[2] + 0.4 * V]);
  const highMesh = new THREE.Mesh(highGeo, material);
  highMesh.castShadow = true;
  highMesh.receiveShadow = true;
  pivot.add(highMesh);
  body.add(pivot);

  let present = 1;
  let presentTarget = 1;
  let hopAt = -1;
  let hopHeight = 0.22;
  let clock = 0;
  const phase = seed * 1.9;

  return {
    root,
    plateHeight: PLATE_HEIGHT,
    setPresent(p, instant = false) {
      presentTarget = p ? 1 : 0;
      if (instant) present = presentTarget;
    },
    hop(height = 0.22) {
      hopHeight = height;
      hopAt = clock;
    },
    update(dt, time, animate, idle) {
      clock += dt;
      if (animate) present = presentTarget === 1 ? Math.min(1, present + dt / 0.7) : Math.max(0, present - dt / 0.4);
      else {
        present = presentTarget;
        hopAt = -1;
      }
      pivot.rotation.z = Math.sin(time * 1.1 + phase) * 0.05 + Math.sin(time * 2.3 + phase) * 0.02;
      pivot.rotation.x = Math.sin(time * 0.8 + phase) * 0.03;
      let lift = 0;
      let squash = 1;
      if (hopAt >= 0) {
        const t = (clock - hopAt) / 0.45;
        if (t >= 1.3) hopAt = -1;
        else if (t < 1) lift = Math.sin(t * Math.PI) * hopHeight;
        else squash = 1 - Math.sin(((t - 1) / 0.3) * Math.PI) * 0.07;
      }
      const breath = idle ? 1 + Math.sin(time * 1.7 + phase) * 0.012 : 1;
      body.position.y = lift;
      body.scale.set(1 + (1 - squash) * 0.5, breath * squash, 1 + (1 - squash) * 0.5);
      root.visible = present > 0.001;
      // Arriving: grow in with a small overshoot.
      const p = present;
      const grow = presentTarget === 1 && p < 1 ? Math.min(1.08, p * 1.25) - Math.max(0, p - 0.85) * 0.5 : p;
      root.scale.setScalar(Math.max(0.001, grow));
    },
    dispose() {
      bodyGeo.dispose();
      lowGeo.dispose();
      highGeo.dispose();
    },
  };
}
