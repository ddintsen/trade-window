// Tokens as goods on the bridge: a realm token is a crate with its logo
// stamped on the front and its symbol stencilled on the lid, a native coin
// is a stack of coins with its logo struck on top, and wrapped GNOT is a
// crate with the coin fixed to its front, so a token that only calls itself
// GNOT never looks like the coin. A pile grows with the amount, the way a
// game draws a stack: one coin, a stack, two stacks, a heap; one crate up to
// three. An NFT is one of a kind: its picture in a brass frame on a stand,
// with its number on a plate. Logos are the tokens' own, from the token
// list wallets read, drawn small and crisp like everything else here; a
// token without a listed logo shows its symbol instead.

import * as THREE from "three";
import { Grid, labelTexture, meshGrid, PAL, pick, rng } from "./kit";

export type ItemShape = "coin" | "cube" | "wrapped" | "nft";
export type Tier = 0 | 1 | 2 | 3;

export interface ItemLook {
  shape: ItemShape;
  symbol: string;
  /** The token's logo or the NFT's picture; null when it has none. */
  logo?: string | null;
  /** How big the pile is; NFTs are always one. */
  tier?: Tier;
  /** An NFT's number, "#12". */
  badge?: string;
}

export interface ItemMesh {
  group: THREE.Group;
  /** Turn the item red for a moment (taken out by the other side). */
  setAlarm(amount: number): void;
  dispose(): void;
}

interface Picture {
  material: THREE.MeshStandardMaterial;
  ready: Promise<void>;
}

export interface ItemParts {
  crate: THREE.BufferGeometry;
  crateMat: THREE.Material;
  coins(tier: Tier): CoinPile;
  emblem: THREE.BufferGeometry;
  brass: THREE.MeshStandardMaterial;
  face: THREE.PlaneGeometry;
  coinFace: THREE.PlaneGeometry;
  alarm: THREE.BoxGeometry;
  stand: THREE.BufferGeometry;
  frame: THREE.BufferGeometry;
  canvasFace: THREE.PlaneGeometry;
  plateFace: THREE.PlaneGeometry;
  backFace: THREE.PlaneGeometry;
  backing: THREE.MeshStandardMaterial;
  labels: Map<string, THREE.MeshBasicMaterial>;
  font: string;
  /** A logo's material, filled in once the image has loaded. */
  logo(url: string): Picture;
  /** An NFT's picture: like a logo, but lit from within, as if on display. */
  picture(url: string): Picture;
  /** An NFT's number on a brass plate. */
  plate(text: string): THREE.MeshBasicMaterial;
  dispose(): void;
}

interface CoinPile {
  geometry: THREE.BufferGeometry;
  /** Where the face sits: on top of the tallest stack. */
  top: THREE.Vector3;
  /** The face's size against a full coin. */
  scale: number;
}

const LOGO_PX = 56; // logos are drawn this small, then shown crisp
const PICTURE_PX = 64;

export const CRATE = 0.38;
const C = 0.036; // a coin voxel
const NV = 0.03; // an NFT stand and frame voxel

/** Stacks of coins per tier: centre x, centre z (in coin voxels) and how many coins. */
const PILES: Record<Tier, { r: number; stacks: [number, number, number][] }> = {
  0: { r: 4.6, stacks: [[0, 0, 1]] },
  1: { r: 4.6, stacks: [[0, 0, 3]] },
  2: { r: 3.6, stacks: [[-3.3, -0.8, 4], [3.4, 0.9, 3]] },
  3: {
    r: 3.1,
    stacks: [
      [-3.5, -2.1, 5],
      [3.5, -1.5, 4],
      [0.2, 2.9, 3],
      [-6.3, 3.5, 1],
      [6.1, 3.3, 1],
    ],
  },
};

/** A stack is a little uneven: each coin sits a voxel off the one below. */
const jitter = (layer: number): [number, number] => [layer % 3 === 1 ? 1 : 0, layer % 3 === 2 ? 1 : 0];

function coinPile(tier: Tier): CoinPile {
  const g = new Grid();
  const { r: R, stacks } = PILES[tier];
  let top = new THREE.Vector3();
  let tallest = 0;
  for (const [cx, cz, count] of stacks) {
    for (let layer = 0; layer < count; layer++) {
      const [jx, jz] = jitter(layer);
      const x0 = cx + jx;
      const z0 = cz + jz;
      for (let x = Math.floor(x0 - R - 1); x <= Math.ceil(x0 + R + 1); x++) {
        for (let z = Math.floor(z0 - R - 1); z <= Math.ceil(z0 + R + 1); z++) {
          const d = Math.hypot(x - x0, z - z0);
          if (d > R) continue;
          g.set(x, layer, z, d > R - 1.1 ? PAL.brassDark : PAL.brass);
        }
      }
    }
    if (count > tallest) {
      tallest = count;
      const [jx, jz] = jitter(count - 1);
      top = new THREE.Vector3((cx + jx) * C, count * C + 0.002, (cz + jz) * C);
    }
  }
  return { geometry: meshGrid(g, C, [-C / 2, 0, -C / 2]), top, scale: R / 4.6 };
}

/** A crate of planks in a darker frame, hollow inside. */
function crateGrid(): Grid {
  const g = new Grid();
  const r = rng(21);
  const n = 9;
  for (let x = 0; x <= n; x++) {
    for (let y = 0; y <= n; y++) {
      for (let z = 0; z <= n; z++) {
        const edges = [x, y, z].filter((v) => v === 0 || v === n).length;
        if (edges === 0) continue;
        if (edges >= 2) g.set(x, y, z, pick(PAL.crateFrame, r()));
        else g.set(x, y, z, edges === 1 && y % 3 === 0 ? 0xa9814f : pick(PAL.crate, r()));
      }
    }
  }
  return g;
}

function emblemGrid(): Grid {
  const g = new Grid();
  for (let x = -3; x <= 3; x++) {
    for (let y = -3; y <= 3; y++) {
      const d = Math.hypot(x, y);
      if (d > 3.3) continue;
      g.set(x, y, 0, d > 2.3 ? PAL.brassDark : PAL.brass);
    }
  }
  return g;
}

/** A low stand of dark wood with a groove the frame sits in. */
function standGrid(): Grid {
  const g = new Grid();
  const r = rng(61);
  g.box(-6, 6, 0, 0, -3, 2, () => pick(PAL.woodDark, r()));
  g.box(-5, 5, 1, 1, -2, 1, () => pick(PAL.wood, r()));
  return g;
}

/** A brass frame, eleven voxels wide and fourteen tall, one deep. */
const FRAME_W = 11;
const FRAME_H = 14;
function frameGrid(): Grid {
  const g = new Grid();
  for (let x = 0; x < FRAME_W; x++) {
    for (let y = 0; y < FRAME_H; y++) {
      const edge = x === 0 || y === 0 || x === FRAME_W - 1 || y === FRAME_H - 1;
      const bar = y === 3; // the bar between the picture and the plate
      if (!edge && !bar) continue;
      const corner = (x === 0 || x === FRAME_W - 1) && (y === 0 || y === FRAME_H - 1);
      g.set(x, y, 0, corner ? PAL.brassDark : PAL.brass);
    }
  }
  return g;
}

function plateTexture(text: string, font: string): THREE.CanvasTexture {
  const w = 256;
  const h = 72;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#c99a45";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a2312";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let px = h * 0.62;
    ctx.font = `800 ${px}px ${font}`;
    const max = w * 0.88;
    const tw = ctx.measureText(text).width;
    if (tw > max) {
      px = Math.max(h * 0.3, (px * max) / tw);
      ctx.font = `800 ${px}px ${font}`;
    }
    ctx.fillText(text, w / 2, h / 2 + px * 0.04);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function loadInto(url: string, px: number, material: THREE.MeshStandardMaterial, canvas: HTMLCanvasElement, tex: THREE.Texture): Promise<void> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  return img
    .decode()
    .then(() => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(img, 0, 0, px, px);
      tex.needsUpdate = true;
      material.needsUpdate = true;
    })
    .catch(() => {
      // no picture: the stamp stays empty and the symbol says what it is
    });
}

export function createItemParts(font: string): ItemParts {
  const cell = CRATE / 10;
  const crate = meshGrid(crateGrid(), cell, [-CRATE / 2, 0, -CRATE / 2]);
  const crateMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, envMapIntensity: 0.35 });
  const piles = new Map<Tier, CoinPile>();
  const emblem = meshGrid(emblemGrid(), 0.032, [-0.016, -0.016, 0]);
  const brass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.45, envMapIntensity: 1 });
  const stand = meshGrid(standGrid(), NV, [-NV / 2, 0, -NV / 2]);
  const frame = meshGrid(frameGrid(), NV, [(-FRAME_W * NV) / 2, 0, -NV / 2]);
  const backing = new THREE.MeshStandardMaterial({ color: 0x15191b, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const labels = new Map<string, THREE.MeshBasicMaterial>();
  const logos = new Map<string, Picture>();
  const pictures = new Map<string, Picture>();
  const plates = new Map<string, THREE.MeshBasicMaterial>();

  const canvasMaterial = (px: number, lit: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.4,
      roughness: 0.7,
      metalness: 0,
      envMapIntensity: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      ...(lit ? { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 } : {}),
    });
    return { canvas, tex, material };
  };

  const parts: ItemParts = {
    crate,
    crateMat,
    coins(tier) {
      let p = piles.get(tier);
      if (!p) {
        p = coinPile(tier);
        piles.set(tier, p);
      }
      return p;
    },
    emblem,
    brass,
    face: new THREE.PlaneGeometry(CRATE * 0.62, CRATE * 0.62),
    coinFace: new THREE.PlaneGeometry(0.3, 0.3),
    alarm: new THREE.BoxGeometry(CRATE * 1.08, CRATE * 1.08, CRATE * 1.08),
    stand,
    frame,
    canvasFace: new THREE.PlaneGeometry((FRAME_W - 2) * NV, (FRAME_H - 5) * NV),
    plateFace: new THREE.PlaneGeometry((FRAME_W - 2) * NV, 2 * NV),
    backFace: new THREE.PlaneGeometry((FRAME_W - 2) * NV, (FRAME_H - 2) * NV),
    backing,
    labels,
    font,
    logo(url) {
      let entry = logos.get(url);
      if (!entry) {
        const { canvas, tex, material } = canvasMaterial(LOGO_PX, false);
        entry = { material, ready: loadInto(url, LOGO_PX, material, canvas, tex) };
        logos.set(url, entry);
      }
      return entry;
    },
    picture(url) {
      let entry = pictures.get(url);
      if (!entry) {
        const { canvas, tex, material } = canvasMaterial(PICTURE_PX, true);
        material.alphaTest = 0;
        material.transparent = false;
        entry = { material, ready: loadInto(url, PICTURE_PX, material, canvas, tex) };
        pictures.set(url, entry);
      }
      return entry;
    },
    plate(text) {
      let m = plates.get(text);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ map: plateTexture(text, font), polygonOffset: true, polygonOffsetFactor: -2 });
        plates.set(text, m);
      }
      return m;
    },
    dispose() {
      [crate, emblem, stand, frame, parts.face, parts.coinFace, parts.alarm, parts.canvasFace, parts.plateFace, parts.backFace].forEach((g) => g.dispose());
      piles.forEach((p) => p.geometry.dispose());
      piles.clear();
      crateMat.dispose();
      brass.dispose();
      backing.dispose();
      for (const m of [...labels.values(), ...plates.values()]) {
        m.map?.dispose();
        m.dispose();
      }
      labels.clear();
      plates.clear();
      for (const { material } of [...logos.values(), ...pictures.values()]) {
        material.map?.dispose();
        material.dispose();
      }
      logos.clear();
      pictures.clear();
    },
  };
  return parts;
}

function label(parts: ItemParts, text: string, color: string): THREE.MeshBasicMaterial {
  const key = `${color}|${text}`;
  let m = parts.labels.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: labelTexture(text, parts.font, color), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    parts.labels.set(key, m);
  }
  return m;
}

const shadowed = (m: THREE.Mesh) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/** One crate with its face: the logo or the symbol in front, the coin for wrapped GNOT. */
function crateUnit(parts: ItemParts, look: ItemLook, lid: boolean): THREE.Group {
  const unit = new THREE.Group();
  const logo = look.logo ? parts.logo(look.logo).material : null;
  unit.add(shadowed(new THREE.Mesh(parts.crate, parts.crateMat)));
  const stencil = (text: string) => {
    const top = new THREE.Mesh(parts.face, label(parts, text, "#3a2312"));
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, CRATE + 0.002, 0);
    unit.add(top);
  };
  if (look.shape === "cube") {
    const face = new THREE.Mesh(parts.face, logo ?? label(parts, look.symbol, "#3a2312"));
    face.position.set(0, CRATE / 2, CRATE / 2 + 0.002);
    unit.add(face);
    if (logo && lid) stencil(look.symbol);
  } else {
    const emblem = shadowed(new THREE.Mesh(parts.emblem, parts.brass));
    emblem.position.set(0, CRATE / 2, CRATE / 2);
    unit.add(emblem);
    if (logo) {
      const face = new THREE.Mesh(parts.coinFace, logo);
      face.scale.setScalar(0.66);
      face.position.set(0, CRATE / 2, CRATE / 2 + 0.036);
      unit.add(face);
    }
    if (lid) stencil("wGNOT");
  }
  return unit;
}

/** Items sit on their base: y = 0 is the bottom. */
export function createItemMesh(parts: ItemParts, look: ItemLook): ItemMesh {
  const group = new THREE.Group();
  const tier = look.tier ?? 1;

  if (look.shape === "coin") {
    const pile = parts.coins(tier);
    group.add(shadowed(new THREE.Mesh(pile.geometry, parts.brass)));
    const logo = look.logo ? parts.logo(look.logo).material : null;
    const face = new THREE.Mesh(parts.coinFace, logo ?? label(parts, look.symbol, "#5a3c10"));
    face.rotation.x = -Math.PI / 2;
    face.position.copy(pile.top);
    face.scale.setScalar(pile.scale * (logo ? 0.92 : 1));
    group.add(face);
  } else if (look.shape === "nft") {
    group.add(shadowed(new THREE.Mesh(parts.stand, parts.crateMat)));
    // The frame leans back a little in the stand's groove.
    const holder = new THREE.Group();
    holder.position.set(0, 2 * NV, -0.01);
    holder.rotation.x = -0.2;
    group.add(holder);
    holder.add(shadowed(new THREE.Mesh(parts.frame, parts.brass)));
    const back = new THREE.Mesh(parts.backFace, parts.backing);
    back.position.set(0, (FRAME_H * NV) / 2, -0.001);
    holder.add(back);
    const pictureMat = look.logo ? parts.picture(look.logo).material : label(parts, look.symbol, "#e8eeeb");
    const canvas = new THREE.Mesh(parts.canvasFace, pictureMat);
    canvas.position.set(0, (4 + (FRAME_H - 5) / 2) * NV, NV / 2 + 0.001);
    holder.add(canvas);
    if (look.badge) {
      const plate = new THREE.Mesh(parts.plateFace, parts.plate(look.badge));
      plate.position.set(0, 2 * NV, NV / 2 + 0.001);
      holder.add(plate);
    }
  } else {
    // One crate up to a stack of three: more of the token, more crates.
    const count = tier >= 3 ? 3 : tier === 2 ? 2 : 1;
    if (count === 1) group.add(crateUnit(parts, look, true));
    else {
      const s = count === 2 ? 0.64 : 0.6;
      const spots: [number, number, number, number][] =
        count === 2
          ? [
              [-0.128, 0, 0.02, 0.08],
              [0.13, 0, -0.03, -0.1],
            ]
          : [
              [-0.12, 0, 0.02, 0.06],
              [0.122, 0, -0.02, -0.08],
              [0.004, CRATE * s, 0, 0.14],
            ];
      spots.forEach(([x, y, z, turn], i) => {
        const unit = crateUnit(parts, look, i === spots.length - 1);
        unit.scale.setScalar(s);
        unit.position.set(x, y, z);
        unit.rotation.y = turn;
        group.add(unit);
      });
    }
  }

  let alarmMesh: THREE.Mesh | null = null;
  let alarmMat: THREE.MeshBasicMaterial | null = null;
  return {
    group,
    setAlarm(amount) {
      if (amount <= 0 && !alarmMesh) return;
      if (!alarmMesh) {
        alarmMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.5, 0.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        alarmMesh = new THREE.Mesh(parts.alarm, alarmMat);
        alarmMesh.position.y = CRATE / 2;
        group.add(alarmMesh);
      }
      if (alarmMat) alarmMat.opacity = Math.max(0, Math.min(1, amount)) * 0.55;
      alarmMesh.visible = amount > 0.001;
    },
    dispose() {
      alarmMat?.dispose();
    },
  };
}
