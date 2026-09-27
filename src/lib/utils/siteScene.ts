import * as THREE from 'three';
import { ownTexture } from '$lib/utils/furnitureModelResources';

/**
 * Presentation landscape for the 3D viewer: a lawn, a paved terrace around the
 * building and a ring of stylised trees and shrubs. Everything is procedural
 * (no downloads) and deterministic, so repeated renders and exports match.
 * Units are centimetres, like the rest of the scene.
 */

/** Small seeded PRNG so textures and planting are identical on every build. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Real-world size of one grass texture tile. */
export const GRASS_TILE_CM = 240;

/** Seamless lawn texture: layered colour noise plus short blades. */
export function createGrassTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(1337);

  ctx.fillStyle = '#62803f';
  ctx.fillRect(0, 0, size, size);

  // Soft patches break up repetition at mid distance.
  for (let i = 0; i < 70; i++) {
    const x = rand() * size, y = rand() * size, r = 30 + rand() * 90;
    const light = rand() > 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, light ? 'rgba(140,160,80,0.22)' : 'rgba(55,80,35,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  // Fine speckle.
  for (let i = 0; i < 26000; i++) {
    const h = 78 + rand() * 26, s = 30 + rand() * 25, l = 22 + rand() * 24;
    ctx.fillStyle = `hsla(${h},${s}%,${l}%,0.55)`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }

  // Blades, wrapped at the edges so the tile stays seamless.
  ctx.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size, y = rand() * size;
    const len = 3 + rand() * 6, ang = -Math.PI / 2 + (rand() - 0.5) * 1.2;
    const h = 80 + rand() * 24, l = 30 + rand() * 26;
    ctx.strokeStyle = `hsla(${h},42%,${l}%,0.6)`;
    ctx.lineWidth = 0.8 + rand() * 0.8;
    const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (ox && (x + ox + dx < -2 || x + ox > size + 2)) continue;
      if (oy && (y + oy + dy < -2 || y + oy > size + 2)) continue;
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + dx, y + oy + dy); ctx.stroke();
    }
  }

  const tex = ownTexture(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Real-world size of one paver texture tile (4 × 4 slabs of 60 cm). */
const PAVER_TILE_CM = 240;

/** Light stone slabs with recessed joints. */
function createPaverTexture(): THREE.CanvasTexture {
  const size = 512, slabs = 4, step = size / slabs;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(4242);
  ctx.fillStyle = '#a79d8e';
  ctx.fillRect(0, 0, size, size);
  for (let r = 0; r < slabs; r++) for (let c = 0; c < slabs; c++) {
    const l = 76 + rand() * 7;
    ctx.fillStyle = `hsl(38, ${10 + rand() * 6}%, ${l}%)`;
    ctx.fillRect(c * step + 2, r * step + 2, step - 4, step - 4);
  }
  for (let i = 0; i < 14000; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(60,50,40,0.07)';
    ctx.fillRect(rand() * size, rand() * size, 1.5, 1.5);
  }
  const tex = ownTexture(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

type Planting = { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry; trunkMat: THREE.Material; crownMats: THREE.Material[] };

function addTree(group: THREE.Group, p: Planting, x: number, z: number, y: number, scale: number, rand: () => number) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(p.trunk, p.trunkMat);
  trunk.scale.setScalar(scale);
  trunk.position.y = 80 * scale;
  trunk.castShadow = true;
  tree.add(trunk);
  const blobs = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < blobs; i++) {
    const crown = new THREE.Mesh(p.crown, p.crownMats[Math.floor(rand() * p.crownMats.length)]);
    const r = (0.75 + rand() * 0.45) * scale;
    crown.scale.set(r, r * (0.85 + rand() * 0.3), r);
    const a = (i / blobs) * Math.PI * 2 + rand();
    const off = i === 0 ? 0 : 38 * scale;
    crown.position.set(Math.cos(a) * off, (230 + rand() * 60 + (i === 0 ? 40 : 0)) * scale, Math.sin(a) * off);
    crown.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);
  }
  tree.position.set(x, y, z);
  tree.rotation.y = rand() * Math.PI * 2;
  group.add(tree);
}

function addShrub(group: THREE.Group, p: Planting, x: number, z: number, y: number, rand: () => number) {
  const shrub = new THREE.Mesh(p.crown, p.crownMats[Math.floor(rand() * p.crownMats.length)]);
  const r = 0.26 + rand() * 0.16;
  shrub.scale.set(r * 1.2, r * 0.8, r * 1.2);
  shrub.position.set(x, y + 30 * r, z);
  shrub.rotation.set(rand() * 3, rand() * 3, rand() * 3);
  shrub.castShadow = true;
  shrub.receiveShadow = true;
  group.add(shrub);
}

export interface SiteOptions {
  /** Height of the lawn surface. */
  groundY: number;
  /** Include trees and shrubs (the terrace is always drawn). */
  planting: boolean;
}

/**
 * Build the terrace and planting around a building's bounding box.
 * Returns an empty group for an empty box.
 */
export function createSiteGroup(box: THREE.Box3, options: SiteOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'site';
  if (box.isEmpty()) return group;

  const margin = 140;
  const minX = box.min.x - margin, maxX = box.max.x + margin;
  const minZ = box.min.z - margin, maxZ = box.max.z + margin;
  const w = maxX - minX, d = maxZ - minZ;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

  // Terrace slab: sits below room floors (y = 1) and above the lawn.
  const paverTex = createPaverTexture();
  paverTex.repeat.set(w / PAVER_TILE_CM, d / PAVER_TILE_CM);
  const terraceMat = new THREE.MeshStandardMaterial({
    map: paverTex, roughness: 0.82, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const terrace = new THREE.Mesh(new THREE.PlaneGeometry(w, d), terraceMat);
  terrace.rotation.x = -Math.PI / 2;
  terrace.position.set(cx, options.groundY + 1.3, cz);
  terrace.receiveShadow = true;
  group.add(terrace);

  // Kerb: a thin raised edge that reads as a built border in perspective.
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xb9ae9e, roughness: 0.9 });
  const kerbH = 6, kerbW = 12;
  for (const [kx, kz, kw, kd] of [
    [cx, minZ, w + kerbW, kerbW], [cx, maxZ, w + kerbW, kerbW],
    [minX, cz, kerbW, d], [maxX, cz, kerbW, d],
  ] as const) {
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(kw, kerbH, kd), kerbMat);
    kerb.position.set(kx, options.groundY + kerbH / 2, kz);
    kerb.receiveShadow = true;
    kerb.castShadow = true;
    group.add(kerb);
  }

  if (!options.planting) return group;

  const rand = mulberry32(Math.round(w * 7 + d * 13));
  const planting: Planting = {
    trunk: new THREE.CylinderGeometry(7, 11, 160, 7),
    crown: new THREE.IcosahedronGeometry(95, 1),
    trunkMat: new THREE.MeshStandardMaterial({ color: 0x6b513d, roughness: 0.95 }),
    crownMats: [0x4d6b33, 0x5a7a3a, 0x42602c, 0x66833f].map(color =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true })),
  };

  // Trees on a loose ring beyond the terrace, along the two back sides only.
  // The default camera looks in from the +x/+z corner, so that front yard stays
  // open and the planting frames the house instead of hiding it.
  const ring = 460;
  const spots: [number, number][] = [];
  const side = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 650));
    for (let i = 0; i <= n; i++) {
      if (rand() < 0.35) continue; // leave gaps so the house stays visible
      const t = i / n;
      spots.push([x0 + (x1 - x0) * t + (rand() - 0.5) * 160, z0 + (z1 - z0) * t + (rand() - 0.5) * 160]);
    }
  };
  side(minX - ring, minZ - ring, maxX + ring * 0.6, minZ - ring);
  side(minX - ring, maxZ + ring * 0.6, minX - ring, minZ - ring);
  for (const [x, z] of spots.slice(0, 14)) addTree(group, planting, x, z, options.groundY, 0.75 + rand() * 0.4, rand);

  // Low shrubs hugging the terrace edge.
  const shrubRing = 55;
  for (let i = 0; i < 14; i++) {
    const t = rand();
    const edge = Math.floor(rand() * 4);
    const x = edge < 2 ? minX + t * w : edge === 2 ? minX - shrubRing : maxX + shrubRing;
    const z = edge >= 2 ? minZ + t * d : edge === 0 ? minZ - shrubRing : maxZ + shrubRing;
    addShrub(group, planting, x, z, options.groundY, rand);
  }
  return group;
}

/** Horizon haze colour per sky, used for the fog so the ground melts into the sky. */
export function skyGradientStops(top: string, mid: string, horizon: string): [number, string][] {
  const below = new THREE.Color(horizon).lerp(new THREE.Color('#8f9c7f'), 0.35).getStyle();
  const deep = new THREE.Color(horizon).lerp(new THREE.Color('#6f7d5f'), 0.5).getStyle();
  return [[0, top], [0.32, mid], [0.49, horizon], [0.52, horizon], [0.62, below], [1, deep]];
}
