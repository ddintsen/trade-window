// The trade's furniture: a plank bridge across the pond with a little
// roofed booth in the middle (the window), a lantern under its roof, a sign
// with the version (or the outcome), and a lantern post on each shore that
// lights when its side is ready.

import * as THREE from "three";
import { Bin, Grid, haloTexture, labelTexture, meshGrid, PAL, pick, rng, voxels, type Side, type Vox } from "./kit";

export const DECK = 0.3; // the deck's top
export const SPAN = 3.7; // half the bridge's length

export interface Lantern {
  group: THREE.Group;
  light: THREE.PointLight;
  /** 0 is dark, 1 is lit. */
  set(level: number): void;
}

export interface Bridge {
  group: THREE.Group;
  arch: Lantern;
  lamps: Record<"left" | "right", Lantern>;
  sign: THREE.Group;
  setSign(text: string): void;
  dispose(): void;
}

function lantern(bin: Bin, halo: THREE.Texture, color: THREE.ColorRepresentation, lit: THREE.ColorRepresentation, reach = 5.5): Lantern {
  const group = new THREE.Group();
  const g = new Grid();
  // An iron cage four voxels wide, five tall, with a cap and a ring.
  for (let y = 0; y <= 5; y++) {
    for (const [x, z] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ])
      g.set(x, y, z, PAL.iron);
  }
  g.box(-2, 2, 0, 0, -2, 2, PAL.iron);
  g.box(-2, 2, 6, 6, -2, 2, PAL.iron);
  g.box(-1, 1, 7, 7, -1, 1, PAL.iron);
  g.set(0, 8, 0, PAL.iron);
  const V = 0.045;
  const cage = new THREE.Mesh(bin.keep(meshGrid(g, V, [-V / 2, 0, -V / 2])), bin.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 })));
  cage.castShadow = true;
  const glowMat = bin.keep(new THREE.MeshStandardMaterial({ color: 0x23292c, emissive: new THREE.Color(lit), emissiveIntensity: 0, roughness: 0.4 }));
  const glow = new THREE.Mesh(bin.keep(new THREE.BoxGeometry(V * 3.6, V * 4.6, V * 3.6)), glowMat);
  glow.position.y = V * 3.5;
  group.add(cage, glow);
  const light = new THREE.PointLight(color, 0, reach, 2);
  light.position.y = V * 3.5;
  group.add(light);
  // The glow around it, so a lit lantern reads even where bloom is low.
  const haloMat = bin.keep(new THREE.SpriteMaterial({ map: halo, color: lit, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const glowSprite = new THREE.Sprite(haloMat);
  glowSprite.position.y = V * 3.5;
  glowSprite.scale.setScalar(1.25);
  group.add(glowSprite);
  return {
    group,
    light,
    set(level) {
      glowMat.emissiveIntensity = level * 3.6;
      glowMat.color.setHex(level > 0.05 ? 0x3a3020 : 0x23292c);
      light.intensity = level * 5.2;
      haloMat.opacity = Math.min(1, level) * 0.42;
      glowSprite.visible = level > 0.01;
    },
  };
}

export function createBridge(groundAt: (x: number, z: number) => number, font: string): Bridge {
  const bin = new Bin();
  const group = new THREE.Group();
  const r = rng(13);
  const wood = () => pick(PAL.wood, r());
  const dark = () => pick(PAL.woodDark, r());
  const list: Vox[] = [];

  // Deck planks run across the bridge, with small gaps.
  for (let x = -SPAN; x <= SPAN + 0.001; x += 0.22) list.push([x, DECK - 0.04, 0, 0.2, 0.08, 1.6, wood()]);
  // Stringers and pillars.
  for (const z of [-0.62, 0.62]) list.push([0, DECK - 0.13, z, SPAN * 2, 0.1, 0.12, dark()]);
  for (const x of [-2.45, -1.25, 1.25, 2.45]) for (const z of [-0.7, 0.7]) list.push([x, -0.22, z, 0.14, 0.68, 0.14, dark()]);
  // Rails, open at the booth.
  const posts = [-3.6, -2.4, -1.2, 1.2, 2.4, 3.6];
  for (const x of posts) for (const z of [-0.84, 0.84]) list.push([x, DECK + 0.36, z, 0.11, 0.72, 0.11, dark()]);
  for (const z of [-0.84, 0.84]) {
    for (const [a, b] of [
      [-3.6, -0.34],
      [0.34, 3.6],
    ]) {
      list.push([(a + b) / 2, DECK + 0.68, z, b - a, 0.08, 0.08, wood()]);
      list.push([(a + b) / 2, DECK + 0.36, z, b - a, 0.06, 0.06, dark()]);
    }
  }
  // The booth: four posts, beams and a mossy gable roof over the middle.
  const H = 1.55;
  for (const x of [-0.34, 0.34]) for (const z of [-0.84, 0.84]) list.push([x, DECK + H / 2, z, 0.12, H, 0.12, dark()]);
  for (const z of [-0.84, 0.84]) list.push([0, DECK + H + 0.04, z, 0.84, 0.1, 0.12, wood()]);
  for (const x of [-0.34, 0.34]) list.push([x, DECK + H + 0.04, 0, 0.12, 0.1, 1.8, wood()]);
  const tiles = [0x8a3a26, 0x7a3220, 0x96442c, 0x6e2c1c];
  [1.12, 0.88, 0.64, 0.4, 0.16].forEach((w, i) => {
    for (let z = -1.02; z <= 1.03; z += 0.17) list.push([0, DECK + H + 0.13 + i * 0.08, z, w, 0.08, 0.17, pick(tiles, r())]);
  });
  // Lantern posts on both shores.
  const lampPost = (side: -1 | 1) => {
    const x = 4.05 * side;
    const z = -1.15;
    const y0 = groundAt(x, z);
    list.push([x, y0 + 0.8, z, 0.13, 1.6, 0.13, dark()]);
    list.push([x - 0.2 * side, y0 + 1.56, z, 0.48, 0.08, 0.08, dark()]);
    return new THREE.Vector3(x - 0.38 * side, y0 + 1.5, z);
  };
  const lampAt = { left: lampPost(-1), right: lampPost(1) };

  const geo = bin.keep(voxels(list));
  const woodMat = bin.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.3 }));
  const mesh = new THREE.Mesh(geo, woodMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Hanging lanterns.
  const hang = (at: THREE.Vector3, lamp: Lantern, chain: number) => {
    const c = new THREE.Mesh(bin.keep(new THREE.BoxGeometry(0.025, chain, 0.025)), bin.keep(new THREE.MeshStandardMaterial({ color: PAL.iron, roughness: 0.6, metalness: 0.4 })));
    c.position.set(at.x, at.y - chain / 2, at.z);
    group.add(c);
    lamp.group.position.set(at.x, at.y - chain - 0.4, at.z);
    group.add(lamp.group);
  };
  const halo = bin.keep(haloTexture());
  const arch = lantern(bin, halo, 0xffb46b, 0xffc27a, 6.5);
  hang(new THREE.Vector3(0, DECK + 1.55, 0), arch, 0.12);
  const lamps = {
    left: lantern(bin, halo, PAL.lamp.maker, PAL.lamp.maker, 6),
    right: lantern(bin, halo, PAL.lamp.taker, PAL.lamp.taker, 6),
  };
  hang(lampAt.left, lamps.left, 0.1);
  hang(lampAt.right, lamps.right, 0.1);

  // The sign on the booth's front beam: the version both sides must lock,
  // or how the trade ended.
  const sign = new THREE.Group();
  sign.position.set(0, DECK + H - 0.06, 0.9);
  const board = new THREE.Mesh(bin.keep(voxels([[0, -0.13, 0, 0.66, 0.26, 0.05, 0x6e3a24]])), woodMat);
  board.castShadow = true;
  sign.add(board);
  const textMat = bin.keep(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
  const text = new THREE.Mesh(bin.keep(new THREE.PlaneGeometry(0.62, 0.31)), textMat);
  text.position.set(0, -0.13, 0.027);
  sign.add(text);
  group.add(sign);
  let shown = "";

  return {
    group,
    arch,
    lamps,
    sign,
    setSign(value) {
      if (value === shown) return;
      shown = value;
      textMat.map?.dispose();
      textMat.map = labelTexture(value, font, "#f1e3cf", 256);
      textMat.map.repeat.set(1, 0.5);
      textMat.map.offset.set(0, 0.25);
      textMat.needsUpdate = true;
    },
    dispose() {
      textMat.map?.dispose();
      bin.dispose();
    },
  };
}

export type { Side };
