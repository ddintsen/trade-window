// The trade, as a scene: a clearing in a voxel forest at dusk, drawn in the
// language of gno.land's own voxel forest. A plank bridge crosses the pond
// with a small gate in the middle; each side's gnome stands on its shore,
// its offer laid out on its half of the bridge. A shore lantern lights when
// its side is ready; when both are, the goods hop through the gate to the
// other side. The page drives it with the room state; it only shows what
// the room says. Loaded only on trade pages.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { HorizontalTiltShiftShader } from "three/examples/jsm/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/examples/jsm/shaders/VerticalTiltShiftShader.js";
import { createBridge, DECK, type Bridge } from "@/components/three/bridge";
import { createForest } from "@/components/three/forest";
import { createGnome, PLATE_HEIGHT, type Gnome } from "@/components/three/gnome";
import { createItemMesh, createItemParts, type ItemMesh, type ItemShape, type Tier } from "@/components/three/item-mesh";
import { backOut, Bin, clamp01, damp, easeIn, easeMove, easeOut, Grid, meshGrid, nightEnvironment, pageFont, PAL, pick, rng, span, type Side, type Wind } from "@/components/three/kit";

export interface StageItem {
  key: string;
  shape: ItemShape;
  symbol: string;
  logo: string | null;
  /** How big the pile is. */
  tier: Tier;
  /** An NFT's number. */
  badge: string;
}

export interface StageSide {
  side: Side;
  present: boolean;
  ready: boolean;
  /** Mark removals from this side in red: the other party's side. */
  watched: boolean;
  items: StageItem[];
}

export interface StageState {
  left: StageSide;
  right: StageSide;
  version: number;
  status: "open" | "settled" | "cancelled";
  expired: boolean;
}

export interface StageHandle {
  update(state: StageState): void;
  /** Frame the scene again, after the page's panels changed size. */
  reframe(): void;
  dispose(): void;
}

interface Options {
  reducedMotion: boolean;
  plates: { left: HTMLElement | null; right: HTMLElement | null };
  /** Pixels at the top and bottom covered by the page; the scene frames between them. */
  insets?: () => { top: number; bottom: number };
  onFirstFrame?: () => void;
}

type Half = "left" | "right";
const HALVES: Half[] = ["left", "right"];

const GNOME_X = 4.45;
const SLOTS = 8;
const RUG = 0.026; // a blanket's thickness on the deck
const ITEM = 1.3; // items sit a little larger than life, so they read in a band
const SLOT_X0 = 0.8; // the first slot, clear of the booth's posts and roof
const SLOT_DX = 0.64;

/**
 * A trader's blanket on its half of the bridge: eight lighter squares, the
 * slots, woven into the side's colour.
 */
function rugGeometry(side: Side): THREE.BufferGeometry {
  const g = new Grid();
  const r = rng(side === "maker" ? 31 : 32);
  const pal = PAL.rug[side];
  for (let x = 4; x <= 31; x++) {
    for (let z = -6; z <= 6; z++) {
      const cx = x * 0.1;
      const cz = z * 0.1;
      const edge = x === 4 || x === 31 || Math.abs(z) === 6;
      let inSlot = false;
      for (let k = 0; k < 4; k++) for (const sz of [-0.33, 0.33]) if (Math.abs(cx - (SLOT_X0 + k * SLOT_DX)) <= 0.24 && Math.abs(cz - sz) <= 0.22) inSlot = true;
      const base = new THREE.Color(pick(pal, r()));
      if (inSlot) base.multiplyScalar(1.22);
      else if (edge) base.multiplyScalar(0.7);
      else base.multiplyScalar(0.92);
      g.set(x, 0, z, base.getHex());
    }
  }
  const geo = meshGrid(g, 0.1, [-0.05, 0, -0.05]);
  geo.scale(1, RUG / 0.1, 1);
  return geo;
}

/** Slot 0 is next to the gate in the front row; each row fills outwards. */
function slotPosition(half: Half, slot: number, out = new THREE.Vector3()) {
  const row = slot < 4 ? 1 : 0;
  const k = slot % 4;
  const x = SLOT_X0 + k * SLOT_DX;
  return out.set(half === "left" ? -x : x, DECK + RUG, row === 1 ? 0.33 : -0.33);
}

interface Anim {
  kind: "enter" | "leave" | "cross" | "home";
  t0: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  hop: number;
  red?: boolean;
}

interface ItemObj {
  key: string;
  owner: Half;
  half: Half;
  slot: number;
  look: StageItem;
  mesh: ItemMesh;
  pos: THREE.Vector3;
  turn: number;
  anim: Anim | null;
}

const FinishShader = {
  name: "FinishShader",
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.035 }, vignette: { value: 0.9 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grain;
    uniform float vignette;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float n = rand(vUv * vec2(1213.0, 917.0) + fract(time)) - 0.5;
      c.rgb += n * grain;
      vec2 d = (vUv - 0.5) * vec2(1.0, 1.25);
      c.rgb *= 1.0 - dot(d, d) * vignette;
      gl_FragColor = c;
    }`,
};

export function mountStage(container: HTMLElement, { reducedMotion, plates, insets, onFirstFrame }: Options): StageHandle {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700 || /Mobi|Android/i.test(navigator.userAgent);
  const quality: "high" | "low" = small ? "low" : "high";

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(PAL.sky, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  const bin = new Bin();
  const font = pageFont();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.sky);
  const fog = new THREE.Fog(PAL.fog, 20, 60);
  scene.fog = fog;
  scene.environment = bin.keep(nightEnvironment(renderer));

  const wind: Wind = { uTime: { value: 0 }, uWind: { value: reducedMotion ? 0 : 1 } };

  // Light: a cool dusk sky, a low moon that casts soft shadows, and the
  // lanterns, which are the only warm light in the clearing.
  scene.add(new THREE.HemisphereLight(0x92b6c8, 0x101d18, 1.05));
  const moon = new THREE.DirectionalLight(0xc6d8ec, 1.45);
  moon.position.set(-6, 10, 5);
  moon.castShadow = true;
  const shadowSize = quality === "high" ? 2048 : 1024;
  moon.shadow.mapSize.set(shadowSize, shadowSize);
  moon.shadow.camera.left = -11;
  moon.shadow.camera.right = 11;
  moon.shadow.camera.top = 9;
  moon.shadow.camera.bottom = -9;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 30;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.025;
  moon.shadow.radius = 4;
  scene.add(moon, moon.target);

  const forest = createForest(wind, quality);
  scene.add(forest.group);
  const bridge: Bridge = createBridge(forest.heightAt, font);
  scene.add(bridge.group);
  bridge.arch.set(1);

  const gnomeMat = bin.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.35 }));
  const gnomes: Record<Half, Gnome | null> = { left: null, right: null };
  const gnomeSide: Record<Half, Side | null> = { left: null, right: null };
  const rugs: Record<Half, THREE.Mesh | null> = { left: null, right: null };
  // Each blanket glows in its side's light when that side is ready.
  const rugMats: Record<Half, THREE.MeshStandardMaterial> = {
    left: bin.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, emissiveIntensity: 0 })),
    right: bin.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, emissiveIntensity: 0 })),
  };
  function placeGnome(half: Half, side: Side) {
    if (gnomeSide[half] === side) return;
    const old = gnomes[half];
    if (old) {
      scene.remove(old.root);
      old.dispose();
    }
    const oldRug = rugs[half];
    if (oldRug) {
      scene.remove(oldRug);
      oldRug.geometry.dispose();
    }
    rugMats[half].emissive.setHex(PAL.lamp[side]);
    const rug = new THREE.Mesh(rugGeometry(side), rugMats[half]);
    if (half === "left") rug.rotation.y = Math.PI;
    rug.position.y = DECK;
    rug.receiveShadow = true;
    scene.add(rug);
    rugs[half] = rug;
    const g = createGnome(side, gnomeMat, half === "left" ? 1 : 2);
    const x = half === "left" ? -GNOME_X : GNOME_X;
    g.root.position.set(x, forest.heightAt(x, 0.15), 0.15);
    g.root.rotation.y = half === "left" ? Math.PI / 2 - 0.42 : -(Math.PI / 2 - 0.42);
    scene.add(g.root);
    gnomes[half] = g;
    gnomeSide[half] = side;
  }

  // Items.
  const parts = createItemParts(font);
  const items: ItemObj[] = [];
  const occupied: Record<Half, (ItemObj | null)[]> = { left: Array(SLOTS).fill(null), right: Array(SLOTS).fill(null) };
  let clock = 0;

  const freeSlot = (half: Half) => {
    const i = occupied[half].indexOf(null);
    return i < 0 ? SLOTS - 1 : i;
  };

  function makeItem(owner: Half, half: Half, it: StageItem, slot: number): ItemObj {
    const mesh = createItemMesh(parts, { shape: it.shape, symbol: it.symbol, logo: it.logo, tier: it.tier, badge: it.badge });
    scene.add(mesh.group);
    // Draw again once its logo or picture has loaded, even when nothing moves.
    if (it.logo) {
      void (it.shape === "nft" ? parts.picture(it.logo) : parts.logo(it.logo)).ready.then(() => {
        dirty = true;
        schedule();
      });
    }
    const obj: ItemObj = {
      key: it.key,
      owner,
      half,
      slot,
      look: it,
      mesh,
      pos: slotPosition(half, slot),
      turn: (Math.random() - 0.5) * 0.3,
      anim: null,
    };
    occupied[half][slot] = obj;
    items.push(obj);
    return obj;
  }

  function dropItem(obj: ItemObj) {
    scene.remove(obj.mesh.group);
    obj.mesh.dispose();
    if (occupied[obj.half][obj.slot] === obj) occupied[obj.half][obj.slot] = null;
    const i = items.indexOf(obj);
    if (i >= 0) items.splice(i, 1);
  }

  const clearItems = () => [...items].forEach(dropItem);

  // State. Trade moments always play (unless motion is reduced); the
  // forest's own life plays in passes of five seconds, as 67's scenes do:
  // on arrival, back in view, while the pointer moves over it and when the
  // trade changes, slowing to a stop in the last second (WCAG 2.2.2).
  let shown: StageState | null = null;
  const motion = () => !reducedMotion;
  let ambientUntil = reducedMotion ? 0 : performance.now() + 5000;
  // A device that cannot keep the forest near 30 frames a second keeps
  // only the trade's own moments: the forest stays still. The walkthrough
  // film asks for the same with tw.scene = "still", since it renders in
  // software and frame by frame.
  let struggling = (() => {
    try {
      return localStorage.getItem("tw.scene") === "still";
    } catch {
      return false;
    }
  })();
  let slowSamples = 0;
  let slowTotal = 0;
  const wake = () => {
    if (reducedMotion || struggling) return;
    ambientUntil = Math.max(ambientUntil, performance.now() + 5000);
    schedule();
  };
  const ambientLevel = () => (reducedMotion ? 0 : clamp01((ambientUntil - performance.now()) / 1000));
  let pulseAt = -10;
  let swingAt = -10;
  let closed = 0;
  let closedTarget = 0;
  const lampLevel = { left: 0, right: 0 };
  const lampTarget = { left: 0, right: 0 };
  const pending: { at: number; run: () => void }[] = [];

  function arrange(state: StageState) {
    clearItems();
    if (state.status === "cancelled") return;
    const swap = state.status === "settled";
    HALVES.forEach((owner) => {
      const half: Half = swap ? (owner === "left" ? "right" : "left") : owner;
      state[owner].items.slice(0, SLOTS).forEach((it, i) => makeItem(owner, half, it, i));
    });
  }

  function diffSide(owner: Half, s: StageSide, animate: boolean) {
    const wanted = new Map(s.items.slice(0, SLOTS).map((it) => [it.key, it]));
    for (const obj of [...items]) {
      if (obj.owner !== owner || obj.anim?.kind === "leave" || obj.anim?.kind === "home") continue;
      const it = wanted.get(obj.key);
      if (!it) {
        if (animate) {
          obj.anim = { kind: "leave", t0: clock, dur: s.watched ? 1.0 : 0.45, from: obj.pos.clone(), to: obj.pos.clone(), hop: 0.35, red: s.watched };
          occupied[obj.half][obj.slot] = null;
        } else dropItem(obj);
        continue;
      }
      const was = obj.look;
      if (it.symbol !== was.symbol || it.shape !== was.shape || it.logo !== was.logo || it.tier !== was.tier || it.badge !== was.badge) {
        const at = obj.slot;
        dropItem(obj);
        makeItem(owner, owner, it, at);
      }
      wanted.delete(obj.key);
    }
    for (const it of wanted.values()) {
      const obj = makeItem(owner, owner, it, freeSlot(owner));
      if (animate) obj.anim = { kind: "enter", t0: clock, dur: 0.65, from: obj.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), to: obj.pos.clone(), hop: 0 };
    }
  }

  function crossOver() {
    const movers = items.filter((o) => !o.anim || o.anim.kind === "enter");
    occupied.left.fill(null);
    occupied.right.fill(null);
    HALVES.forEach((owner) => {
      const dest: Half = owner === "left" ? "right" : "left";
      movers
        .filter((o) => o.owner === owner)
        .sort((a, b) => a.slot - b.slot)
        .forEach((o, i) => {
          const from = o.pos.clone();
          o.half = dest;
          o.slot = i;
          occupied[dest][i] = o;
          o.anim = { kind: "cross", t0: clock + i * 0.09 + (owner === "right" ? 0.05 : 0), dur: 1.25, from, to: slotPosition(dest, i), hop: 0.7 };
        });
    });
    pulseAt = clock + 0.55;
    pending.push({ at: clock + 1.55, run: () => HALVES.forEach((h) => gnomes[h]?.hop(0.3)) });
  }

  function sendHome() {
    for (const o of items) {
      if (o.anim?.kind === "leave") continue;
      const x = o.owner === "left" ? -GNOME_X : GNOME_X;
      o.anim = { kind: "home", t0: clock + o.slot * 0.05, dur: 0.9, from: o.pos.clone(), to: new THREE.Vector3(x, forest.heightAt(x, 0.15) + 0.6, 0.2), hop: 0.6 };
      occupied[o.half][o.slot] = null;
    }
  }

  // Playback flags, used by update() and the loop.
  let raf = 0;
  let dirty = true;
  let first = true;
  let last = performance.now();
  let stopped = true; // no frame is coming; the next one starts the clock afresh
  let time = 0;

  function update(next: StageState) {
    placeGnome("left", next.left.side);
    placeGnome("right", next.right.side);
    const prev = shown;
    shown = next;
    const animate = !!prev && motion();

    if (!prev || !animate) arrange(next);
    else if (prev.status === "open" && next.status === "settled") {
      diffSide("left", next.left, false);
      diffSide("right", next.right, false);
      crossOver();
    } else if (prev.status === "open" && next.status === "cancelled") sendHome();
    else if (next.status === "open") {
      diffSide("left", next.left, true);
      diffSide("right", next.right, true);
      if (next.version > prev.version) {
        pulseAt = clock;
        swingAt = clock;
      }
    } else if (prev.status !== next.status) arrange(next);

    bridge.setSign(next.status === "settled" ? "traded" : next.status === "cancelled" || next.expired ? "closed" : `v${next.version}`);
    const open = next.status === "open";
    const settled = next.status === "settled";
    HALVES.forEach((h) => {
      const s = next[h];
      const g = gnomes[h];
      g?.setPresent(s.present, !animate);
      const lit = (open && s.ready && !next.expired) || settled ? 1 : 0;
      if (animate && lit === 1 && lampTarget[h] === 0 && open) g?.hop(0.2);
      lampTarget[h] = lit;
      if (!animate) lampLevel[h] = lit;
    });
    closedTarget = next.status === "cancelled" || (open && next.expired) ? 1 : 0;
    if (!animate) closed = closedTarget;
    dirty = true;
    if (prev) wake();
    schedule();
  }

  function step(dt: number) {
    const m = motion();
    const life = ambientLevel();
    clock += dt;
    time += dt * life;
    wind.uTime.value = time;
    wind.uWind.value = (0.85 + Math.sin(time * 0.13) * 0.25) * Math.min(1, life * 1.5);
    for (let i = pending.length - 1; i >= 0; i--) {
      if (clock >= pending[i].at) pending.splice(i, 1)[0].run();
    }

    forest.update(time, dt * life, life > 0);
    HALVES.forEach((h) => {
      gnomes[h]?.update(dt, time, m, life > 0);
      lampLevel[h] = m ? damp(lampLevel[h], lampTarget[h], 6, dt) : lampTarget[h];
      const flicker = lampLevel[h] > 0.05 ? 1 + (Math.sin(time * 9.1 + (h === "left" ? 0 : 2)) * 0.04 + Math.sin(time * 23.7) * 0.02) * life : 1;
      bridge.lamps[h].set(lampLevel[h] * flicker);
      rugMats[h].emissiveIntensity = lampLevel[h] * 0.16 * flicker;
    });

    closed = m ? damp(closed, closedTarget, 4, dt) : closedTarget;
    const pulse = span(clock, pulseAt, pulseAt + 0.15) * (1 - span(clock, pulseAt + 0.15, pulseAt + 0.9));
    const archFlicker = 1 + (Math.sin(time * 7.3) * 0.03 + Math.sin(time * 19.1) * 0.02) * life;
    bridge.arch.set((1 - closed) * (0.75 + pulse * 1.6) * archFlicker);
    const sw = clock - swingAt;
    bridge.sign.rotation.x = sw >= 0 && sw < 2.2 ? Math.sin(sw * 9) * 0.22 * Math.exp(-sw * 2.2) : 0;

    for (const o of [...items]) {
      const a = o.anim;
      let p = o.pos;
      let scale = 1;
      let spin = 0;
      if (a) {
        const t = span(clock, a.t0, a.t0 + a.dur);
        if (a.kind === "enter") {
          p = a.from.clone().lerp(a.to, easeOut(t));
          scale = backOut(t, 1.8);
        } else if (a.kind === "leave") {
          const e = easeIn(span(t, a.red ? 0.5 : 0, 1));
          p = a.from.clone().add(new THREE.Vector3(0, Math.sin(e * Math.PI * 0.5) * a.hop, 0));
          scale = 1 - e;
          o.mesh.setAlarm(a.red ? Math.min(1, t * 4) * (1 - e) : 0);
        } else {
          const e = a.kind === "cross" ? easeMove(t) : easeIn(t);
          p = a.from.clone().lerp(a.to, e);
          p.y += Math.sin(e * Math.PI) * a.hop;
          spin = Math.sin(e * Math.PI) * (o.owner === "left" ? 0.9 : -0.9);
          if (a.kind === "home") scale = 1 - e;
        }
        if (t >= 1) {
          if (a.kind === "leave" || a.kind === "home") {
            dropItem(o);
            continue;
          }
          o.pos = a.to.clone();
          o.anim = null;
          p = o.pos;
          scale = 1;
          o.mesh.setAlarm(0);
        }
      }
      o.mesh.group.position.copy(p);
      o.mesh.group.scale.setScalar(Math.max(0.001, scale) * ITEM);
      o.mesh.group.rotation.set(0, o.turn + spin + (o.half === "left" ? 0.25 : -0.25), 0);
    }
  }

  const animating = () =>
    items.some((o) => o.anim) ||
    pending.length > 0 ||
    clock < pulseAt + 1 ||
    clock < swingAt + 2.4 ||
    Math.abs(closed - closedTarget) > 0.002 ||
    HALVES.some((h) => Math.abs(lampLevel[h] - lampTarget[h]) > 0.002);

  // Camera and framing.
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
  const target = new THREE.Vector3(0, 0.8, 0);
  const yaw = -0.08;
  const pitch = 0.8;
  const baseDir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
  let distance = 20;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const focus = {
    wide: {
      x: [V(-5.9, 0, 0.2), V(5.9, 0, 0.2)],
      y: [V(0, 2.6, -0.4), V(-GNOME_X, 2.85, 0), V(GNOME_X, 2.85, 0), V(0, 0, 1.3)],
    },
    narrow: {
      x: [V(-5.0, 0.4, 0.3), V(5.0, 0.4, 0.3)],
      y: [V(0, 2.8, -0.4), V(-GNOME_X, 2.65, 0), V(GNOME_X, 2.65, 0), V(0, 0, 1.4)],
    },
  };
  const tmp = new THREE.Vector3();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function aim() {
    const dir = baseDir.clone();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), pointer.x * 0.05);
    dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), -pointer.y * 0.025);
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  // Post: ambient occlusion, a little bloom for the lanterns, the tone map,
  // a tilt-shift blur away from the bridge, then grain and a vignette.
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao: GTAOPass | null = null;
  if (quality === "high") {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.blendIntensity = 1.0;
    gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const hTilt = new ShaderPass(HorizontalTiltShiftShader);
  const vTilt = new ShaderPass(VerticalTiltShiftShader);
  composer.addPass(hTilt);
  composer.addPass(vTilt);
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  let width = 0;
  let height = 0;
  function frame() {
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const cover = insets?.() ?? { top: 0, bottom: 0 };
    const inset = Math.min(height * 0.5, Math.max(0, cover.bottom));
    const topInset = Math.min(height * 0.3, Math.max(0, cover.top));
    const bottom = -1 + (2 * inset) / height;
    const top = 1 - (2 * topInset) / height;
    const pts = camera.aspect >= 1.75 ? focus.wide : focus.narrow;
    const marginX = pts === focus.narrow ? 0.06 : 0.03;
    const marginY = 0.08;
    target.set(0, 0.8, 0);
    for (let k = 0; k < 8; k++) {
      aim();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts.x) {
        tmp.copy(p).project(camera);
        minX = Math.min(minX, tmp.x);
        maxX = Math.max(maxX, tmp.x);
      }
      for (const p of pts.y) {
        tmp.copy(p).project(camera);
        minY = Math.min(minY, tmp.y);
        maxY = Math.max(maxY, tmp.y);
      }
      // The nameplates are part of the picture: keep them inside the frame.
      HALVES.forEach((h) => {
        const el = plates[h];
        if (!el) return;
        const x = h === "left" ? -GNOME_X : GNOME_X;
        tmp.set(x, forest.heightAt(x, 0.15) + PLATE_HEIGHT, 0.15).project(camera);
        const half = Math.max(el.offsetWidth, 150) / width;
        minX = Math.min(minX, tmp.x - half);
        maxX = Math.max(maxX, tmp.x + half);
        maxY = Math.max(maxY, tmp.y + (2 * Math.max(el.offsetHeight, 48)) / height);
      });
      const spanX = (maxX - minX) / (2 - 2 * marginX);
      const spanY = (maxY - minY) / (top - bottom - 2 * marginY);
      distance *= Math.max(spanX, spanY);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const worldPerNdc = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
      target.addScaledVector(up, ((minY + maxY) / 2 - (top + bottom) / 2) * worldPerNdc);
      target.addScaledVector(right, ((minX + maxX) / 2) * worldPerNdc * camera.aspect);
    }
    aim();
    fog.near = distance * 0.9;
    fog.far = distance * 1.85;
    // Keep the bridge sharp; let the far trees and the foreground soften.
    tmp.set(0, DECK, 0).project(camera);
    const focusLine = (tmp.y + 1) / 2;
    hTilt.uniforms.r.value = focusLine;
    vTilt.uniforms.r.value = focusLine;
  }

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      const pr = renderer.getPixelRatio();
      hTilt.uniforms.h.value = 1.6 / (w * pr);
      vTilt.uniforms.v.value = 1.6 / (h * pr);
      bloom.strength = w < 600 ? 0.35 : 0.5;
    }
    frame();
    dirty = true;
    schedule();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return;
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    // A still forest does not follow the pointer either: that would draw a frame per move.
    if (!inside || struggling) return;
    pointer.tx = clamp01((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.ty = clamp01((e.clientY - rect.top) / rect.height) * 2 - 1;
    wake();
  };
  if (!reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });

  let onScreen = true;
  const io = new IntersectionObserver(([entry]) => {
    const was = onScreen;
    onScreen = entry.isIntersecting;
    if (onScreen && !was) wake();
    schedule();
  });
  io.observe(container);
  const onVisibility = () => schedule();
  document.addEventListener("visibilitychange", onVisibility);

  const plateAt = new THREE.Vector3();
  function placePlates() {
    HALVES.forEach((h) => {
      const el = plates[h];
      const g = gnomes[h];
      if (!el || !g) return;
      const present = shown ? shown[h].present : true;
      plateAt.set(g.root.position.x, g.root.position.y + (present ? g.plateHeight : 1.1), g.root.position.z);
      plateAt.project(camera);
      const x = ((plateAt.x + 1) / 2) * width;
      const y = ((1 - plateAt.y) / 2) * height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      el.style.visibility = "visible";
    });
  }

  let lastRender = 0;
  function tick(now: number) {
    raf = 0;
    // The forest alone runs at 30 frames a second; trade moments at full rate.
    if (!dirty && !animating() && now - lastRender < 32) {
      schedule();
      return;
    }
    if (!dirty && !animating() && ambientLevel() > 0.99 && lastRender > 0) {
      slowSamples++;
      slowTotal += now - lastRender;
      if (slowSamples >= 45) {
        if (slowTotal / slowSamples > 50) {
          struggling = true;
          ambientUntil = performance.now();
        }
        slowSamples = 0;
        slowTotal = 0;
      }
    }
    lastRender = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (motion()) {
      pointer.x = damp(pointer.x, pointer.tx, 3, dt);
      pointer.y = damp(pointer.y, pointer.ty, 3, dt);
    }
    step(dt);
    aim();
    placePlates();
    finish.uniforms.time.value = time;
    composer.render(dt);
    dirty = false;
    if (first) {
      first = false;
      onFirstFrame?.();
    }
    schedule();
  }

  function schedule() {
    if (raf) return;
    const settling = Math.abs(pointer.tx - pointer.x) > 0.002 || Math.abs(pointer.ty - pointer.y) > 0.002;
    if (!onScreen || document.hidden || (!dirty && !animating() && ambientLevel() <= 0 && !settling)) {
      stopped = true;
      return;
    }
    if (stopped) {
      stopped = false;
      last = performance.now();
      lastRender = 0; // the pause is not a slow frame
    }
    raf = requestAnimationFrame(tick);
  }

  resize();

  return {
    update,
    reframe() {
      frame();
      dirty = true;
      schedule();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      clearItems();
      gnomes.left?.dispose();
      gnomes.right?.dispose();
      rugs.left?.geometry.dispose();
      rugs.right?.geometry.dispose();
      forest.dispose();
      bridge.dispose();
      parts.dispose();
      gtao?.dispose();
      bin.dispose();
      composer.dispose();
      rt.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
