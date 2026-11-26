// Item icons, rendered once from the same models that sit on the bridge
// and kept as images with a clear background, so they stand on whatever
// slot holds them: the wallet shows the very goods you trade. One small
// offscreen renderer; renders are queued and cached.

import * as THREE from "three";
import { createItemMesh, createItemParts, type ItemParts, type ItemShape, type Tier } from "./item-mesh";
import { nightEnvironment, pageFont } from "./kit";

export interface IconSpec {
  shape: ItemShape;
  symbol: string;
  logo: string | null;
  tier: Tier;
  /** An NFT's number. */
  badge: string;
  /** Pixels per side. */
  size: number;
}

interface Studio {
  renderer: THREE.WebGLRenderer;
  parts: ItemParts;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  size: number;
}

let studio: Studio | null = null;
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

function open(): Studio {
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const parts = createItemParts(pageFont());
  const scene = new THREE.Scene();
  scene.environment = nightEnvironment(renderer);
  scene.add(new THREE.HemisphereLight(0xb8d4dc, 0x1a2a22, 1.6));
  const key = new THREE.DirectionalLight(0xfff2e2, 2.4);
  key.position.set(2.5, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -1;
  key.shadow.camera.right = 1;
  key.shadow.camera.top = 1;
  key.shadow.camera.bottom = -1;
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0x9fd6dc, 1.4);
  rim.position.set(-2, 2, -3);
  scene.add(key, rim);
  // An invisible floor that only catches the item's shadow.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  camera.position.set(0.95, 1.05, 1.45);
  camera.lookAt(0, 0.17, 0);
  studio = { renderer, parts, scene, camera, size: 0 };
  return studio;
}

async function render(spec: IconSpec): Promise<string> {
  const s = open();
  if (spec.logo) await (spec.shape === "nft" ? s.parts.picture(spec.logo) : s.parts.logo(spec.logo)).ready;
  if (s.size !== spec.size) {
    s.renderer.setSize(spec.size, spec.size, false);
    s.size = spec.size;
  }
  const item = createItemMesh(s.parts, { shape: spec.shape, symbol: spec.symbol, logo: spec.logo, tier: spec.tier, badge: spec.badge });
  item.group.rotation.y = spec.shape === "coin" ? 0.2 : spec.shape === "nft" ? 0.32 : 0.15;
  // Each shape fills the slot about the same: a lone coin is small, a heap and a framed picture are large.
  const fit = spec.shape === "coin" ? [1.45, 1.35, 1.12, 1.0][spec.tier] : spec.shape === "nft" ? 0.86 : 1;
  item.group.scale.setScalar(fit);
  item.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  s.scene.add(item.group);
  s.renderer.render(s.scene, s.camera);
  const url = s.renderer.domElement.toDataURL("image/png");
  s.scene.remove(item.group);
  item.dispose();
  return url;
}

/** A data URL of the item's picture; the same request always gets the same picture. */
export function itemIcon(spec: IconSpec): Promise<string> {
  const key = `${spec.shape}|${spec.symbol}|${spec.logo ?? ""}|${spec.tier}|${spec.badge}|${spec.size}`;
  let p = cache.get(key);
  if (!p) {
    p = queue.then(
      () =>
        new Promise<string>((resolve, reject) => {
          // One icon per frame keeps the page responsive while a wallet fills.
          requestAnimationFrame(() => {
            render(spec).then(resolve, reject);
          });
        }),
    );
    queue = p.catch(() => undefined);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
