// The home scene: the mark as two panes of lit glass blocks, standing in a
// voxel clearing at night. The one orchestrated moment: the amber pane
// locks, the aqua pane locks, the two inner blocks cross through the gap
// and the clearing flashes. Plain three.js, loaded only on the home page.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLASS, MAKER_CELLS, TAKER_CELLS } from "@/components/brand/mark";

export interface SceneHandle {
  setPaused(paused: boolean): void;
  dispose(): void;
}

interface Options {
  reducedMotion: boolean;
  onFirstFrame?: () => void;
}

const GROUND = 0x0b0e0d;
const CYCLE = 9; // seconds between moments
const UNIT = 1.06;

/** Seeded so the clearing looks the same on every visit. */
function rng(seed: number) {
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
function bezier(x1: number, y1: number, x2: number, y2: number) {
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

const easeMove = bezier(0.76, 0, 0.24, 1);
const easeOut = bezier(0.23, 1, 0.32, 1);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Progress of t through [a, b]. */
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

function cellPosition([col, row]: readonly [number, number]): THREE.Vector3 {
  return new THREE.Vector3((col - 2) * UNIT, 0.55 + (2 - row) * UNIT, 0);
}

export function mountScene(container: HTMLElement, { reducedMotion, onFirstFrame }: Options): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(GROUND, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(GROUND, 0.03);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  const target = new THREE.Vector3(0, 1.45, 0);
  const cameraBase = new THREE.Vector3(6.4, 4.4, 11.4);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  // Light: moon from behind left, a cool sky, and the panes themselves.
  const hemi = new THREE.HemisphereLight(0x6390a0, 0x0b0e0d, 2.0);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc4dde8, 2.6);
  moon.position.set(-9, 13, -6);
  const fill = new THREE.DirectionalLight(0x7fa8b0, 1.1);
  fill.position.set(8, 5, 10);
  scene.add(fill);
  scene.add(moon);
  const amberLight = new THREE.PointLight(GLASS.maker.core, 10, 9, 2);
  amberLight.position.set(-1.7, 1.7, 1.6);
  scene.add(amberLight);
  const aquaLight = new THREE.PointLight(GLASS.taker.core, 10, 9, 2);
  aquaLight.position.set(1.7, 1.7, 1.6);
  scene.add(aquaLight);
  const flash = new THREE.PointLight(0xe8eeeb, 0, 16, 1.6);
  flash.position.set(0, 3.2, 2.2);
  scene.add(flash);

  const rand = rng(67);
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // Ground: a disc of voxel tiles, flat in the clearing, rising at the rim.
  {
    const R = 13;
    const tiles: { x: number; z: number; h: number; c: number }[] = [];
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x, z);
        if (d > R + 0.3) continue;
        const rim = Math.max(0, d - 6.2);
        const h = 0.4 + rand() * 0.06 + rim * 0.1 + (rim > 0 ? rand() * 0.22 : 0);
        const palette = rim > 0 ? [0x1a2f23, 0x1d3427, 0x172a1f] : [0x15231b, 0x17271e, 0x132019, 0x192b21];
        tiles.push({ x, z, h, c: palette[Math.floor(rand() * palette.length)] });
      }
    }
    const mat = keep(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }));
    const mesh = new THREE.InstancedMesh(box, mat, tiles.length);
    tiles.forEach((t, i) => {
      dummy.position.set(t.x, t.h / 2 - 0.4, t.z);
      dummy.scale.set(0.985, t.h, 0.985);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHex(t.c));
    });
    scene.add(mesh);
  }

  // Pines around the clearing, leaving the side that faces the camera open.
  {
    const camAngle = Math.atan2(cameraBase.z, cameraBase.x);
    const pines: { x: number; z: number; s: number; r: number }[] = [];
    let guard = 0;
    while (pines.length < 26 && guard++ < 600) {
      const a = rand() * Math.PI * 2;
      let diff = Math.abs(a - camAngle);
      diff = Math.min(diff, Math.PI * 2 - diff);
      if (diff < 0.95) continue;
      const r = 6.8 + rand() * 6.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (pines.some((p) => Math.hypot(p.x - x, p.z - z) < 2.1)) continue;
      pines.push({ x, z, s: 0.8 + rand() * 0.55, r: rand() * Math.PI });
    }
    const layers = [2.5, 1.95, 1.4, 0.85];
    const trunkMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 1 }));
    const leafMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    const trunks = new THREE.InstancedMesh(box, trunkMat, pines.length);
    const leaves = new THREE.InstancedMesh(box, leafMat, pines.length * layers.length);
    const greens = [0x24573f, 0x2a6147, 0x204f3a, 0x30684d];
    pines.forEach((p, i) => {
      const ground = 0.05 + Math.max(0, Math.hypot(p.x, p.z) - 6.2) * 0.1;
      dummy.rotation.set(0, p.r, 0);
      dummy.position.set(p.x, ground + 0.55 * p.s, p.z);
      dummy.scale.set(0.42 * p.s, 1.1 * p.s, 0.42 * p.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      layers.forEach((w, j) => {
        dummy.position.set(p.x, ground + (1.1 + 0.36 + j * 0.72) * p.s, p.z);
        dummy.scale.set(w * p.s, 0.72 * p.s, w * p.s);
        dummy.updateMatrix();
        leaves.setMatrixAt(i * layers.length + j, dummy.matrix);
        leaves.setColorAt(i * layers.length + j, color.setHex(greens[(i + j) % greens.length]));
      });
    });
    scene.add(trunks, leaves);
  }

  // Rounded bushes at the edge of the clearing.
  {
    const bushGeo = keep(new RoundedBoxGeometry(1, 1, 1, 3, 0.3));
    const bushMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.85 }));
    const spots = [
      [-4.6, -2.4],
      [-5.4, 1.2],
      [4.9, -2.9],
      [5.6, 0.6],
      [-2.8, -4.6],
      [2.2, -5.1],
      [-6.2, -4.2],
      [6.4, -4.6],
    ];
    const parts: { x: number; y: number; z: number; s: number }[] = [];
    for (const [bx, bz] of spots) {
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const s = 0.55 + rand() * 0.6;
        parts.push({ x: bx + (rand() - 0.5) * 1.2, y: s / 2 + 0.03, z: bz + (rand() - 0.5) * 1.2, s });
      }
    }
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, parts.length);
    const tones = [0x27503a, 0x2c5a41, 0x224732];
    parts.forEach((p, i) => {
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
      bushes.setColorAt(i, color.setHex(tones[i % tones.length]));
    });
    scene.add(bushes);
  }

  // The panes: the mark's grid, each cell a block of glass lit from inside.
  const panes = new THREE.Group();
  panes.rotation.y = 0.3;
  scene.add(panes);

  const shellGeo = keep(new RoundedBoxGeometry(0.92, 0.92, 0.92, 4, 0.17));
  const coreGeo = keep(new RoundedBoxGeometry(0.44, 0.44, 0.44, 3, 0.1));
  const materials = {
    maker: {
      shell: keep(
        new THREE.MeshPhysicalMaterial({
          color: GLASS.maker.rim,
          emissive: GLASS.maker.rim,
          emissiveIntensity: 0.32,
          roughness: 0.2,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.25,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      ),
      core: keep(new THREE.MeshStandardMaterial({ color: GLASS.maker.core, emissive: GLASS.maker.core, emissiveIntensity: 0.85, roughness: 0.35 })),
    },
    taker: {
      shell: keep(
        new THREE.MeshPhysicalMaterial({
          color: GLASS.taker.rim,
          emissive: GLASS.taker.rim,
          emissiveIntensity: 0.32,
          roughness: 0.2,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.25,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      ),
      core: keep(new THREE.MeshStandardMaterial({ color: GLASS.taker.core, emissive: GLASS.taker.core, emissiveIntensity: 0.85, roughness: 0.35 })),
    },
  };

  function block(side: "maker" | "taker") {
    const g = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, materials[side].core);
    const shell = new THREE.Mesh(shellGeo, materials[side].shell);
    shell.renderOrder = 2;
    g.add(core, shell);
    return g;
  }

  // The two inner blocks move; the mark's cells give where they end up.
  const amberHome = cellPosition([1, 0]);
  const aquaHome = cellPosition([3, 2]);
  const amberAway = cellPosition(MAKER_CELLS[5]);
  const aquaAway = cellPosition(TAKER_CELLS[5]);
  for (const cell of MAKER_CELLS.slice(0, 5)) {
    const b = block("maker");
    b.position.copy(cellPosition(cell));
    panes.add(b);
  }
  for (const cell of TAKER_CELLS.slice(0, 5)) {
    const b = block("taker");
    b.position.copy(cellPosition(cell));
    panes.add(b);
  }
  const amber = block("maker");
  const aqua = block("taker");
  panes.add(amber, aqua);

  // Reduced motion shows the finished swap: the mark itself.
  let swapped = reducedMotion;
  const place = () => {
    amber.position.copy(swapped ? amberAway : amberHome);
    aqua.position.copy(swapped ? aquaAway : aquaHome);
  };
  place();

  const curve = (from: THREE.Vector3, to: THREE.Vector3, depth: number) =>
    new THREE.QuadraticBezierCurve3(from, new THREE.Vector3(0, (from.y + to.y) / 2, depth), to);

  // Playback state.
  let paused = false;
  let raf = 0;
  let dirty = true;
  let first = true;
  let clock = 0; // seconds of timeline played
  let last = performance.now();
  let cycleStart = 0.6; // the first moment starts shortly after load

  // Sizing.
  let width = 0;
  let height = 0;
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0 || (w === width && h === height)) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow frames step back so both panes and some trees stay in view.
    const back = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.9 : 1;
    camera.zoom = 1 / back;
    camera.updateProjectionMatrix();
    dirty = true;
    schedule();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // Pointer parallax, eased.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  if (!reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });

  // Visibility: stop drawing offscreen and in hidden tabs.
  let onScreen = true;
  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    schedule();
  });
  io.observe(container);
  const onVisibility = () => schedule();
  document.addEventListener("visibilitychange", onVisibility);

  function apply(t: number) {
    // t is seconds since the current moment began.
    const makerLock = easeOut(span(t, 0, 0.55)) * (1 - easeOut(span(t, 3.4, 4.6)));
    const takerLock = easeOut(span(t, 0.65, 1.2)) * (1 - easeOut(span(t, 3.4, 4.6)));
    materials.maker.core.emissiveIntensity = 0.85 + makerLock * 2.4;
    materials.maker.shell.emissiveIntensity = 0.32 + makerLock * 0.9;
    materials.taker.core.emissiveIntensity = 0.85 + takerLock * 2.4;
    materials.taker.shell.emissiveIntensity = 0.32 + takerLock * 0.9;
    amberLight.intensity = 7 + makerLock * 26;
    aquaLight.intensity = 7 + takerLock * 26;

    const m = easeMove(span(t, 1.45, 2.75));
    const fromA = swapped ? amberAway : amberHome;
    const toA = swapped ? amberHome : amberAway;
    const fromB = swapped ? aquaAway : aquaHome;
    const toB = swapped ? aquaHome : aquaAway;
    amber.position.copy(curve(fromA, toA, 1.5).getPoint(m));
    aqua.position.copy(curve(fromB, toB, -1.5).getPoint(m));
    const spin = Math.sin(m * Math.PI) * 0.6;
    amber.rotation.set(spin * 0.3, spin, 0);
    aqua.rotation.set(-spin * 0.3, -spin, 0);

    const f = span(t, 2.6, 2.85) * (1 - span(t, 2.85, 3.6));
    flash.intensity = f * 60;
    hemi.intensity = 1.1 + f * 1.4;
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let moving = false;

    if (!reducedMotion && !paused) {
      clock += dt;
      const t = clock - cycleStart;
      if (t >= 0) {
        if (t <= 4.8) {
          apply(t);
          moving = true;
        } else {
          // The moment is over: the blocks rest on the other side.
          swapped = !swapped;
          place();
          amber.rotation.set(0, 0, 0);
          aqua.rotation.set(0, 0, 0);
          apply(-1);
          cycleStart += CYCLE;
          dirty = true;
        }
      }

      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
      if (Math.abs(pointer.tx - pointer.x) > 0.001 || Math.abs(pointer.ty - pointer.y) > 0.001) moving = true;
    }

    camera.position.set(cameraBase.x + pointer.x * 0.9, cameraBase.y - pointer.y * 0.45, cameraBase.z);
    camera.lookAt(target);

    if (moving || dirty) {
      renderer.render(scene, camera);
      dirty = false;
      if (first) {
        first = false;
        onFirstFrame?.();
      }
    }
    schedule();
  }

  function schedule() {
    if (raf) return;
    if (!onScreen || document.hidden) return;
    if ((reducedMotion || paused) && !dirty) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  resize();
  apply(-1);
  schedule();

  return {
    setPaused(p: boolean) {
      paused = p;
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
      scene.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
