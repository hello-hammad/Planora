/**
 * Catalog previews for the Build and Rooms panels.
 * - 2D: the opening drawn by the real plan renderer, so the tile matches the canvas.
 * - 3D: a small studio render (PBR materials, soft shadows) of the opening set in a wall,
 *   or of a furnished cut-away room using the same furniture models as the 3D view.
 * Results are cached as data URLs.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { get } from 'svelte/store';
import type { Door, Wall, Window as Win } from '$lib/models/types';
import { drawDoorOnWall, drawWall, drawWindowOnWall } from './canvasRenderer';
import type { CanvasState } from './canvasInteraction';
import { projectSettings } from '$lib/stores/settings';
import { roomTemplates } from './roomTemplates';
import { getCatalogItem } from './furnitureCatalog';
import { getModelFile } from './furnitureModelFiles';
import { loadCatalogModel, disposeModel } from './furnitureModelResources';
import { fitFurnitureModel } from './furnitureModelLoader';
import { createFurnitureModel } from './furnitureModels3d';

export const PREVIEW_W = 240;
export const PREVIEW_H = 172;
const cache = new Map<string, Promise<string | null>>();

// ── 2D: real plan symbols ───────────────────────────────────────────────

const DOOR_WIDTH: Record<Door['type'], number> = { single: 90, double: 150, sliding: 180, french: 150, pocket: 90, bifold: 180, opening: 100, garage: 240 };
const WINDOW_WIDTH: Record<Win['type'], number> = { standard: 120, fixed: 100, casement: 80, sliding: 180, bay: 200 };

function planPreview(kind: 'door' | 'window', type: string): string | null {
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = PREVIEW_W * dpr; canvas.height = PREVIEW_H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
  const opening = kind === 'door' ? DOOR_WIDTH[type as Door['type']] : WINDOW_WIDTH[type as Win['type']];
  const length = opening + 56;
  const zoom = Math.min((PREVIEW_W - 20) / length, (PREVIEW_H - 24) / (opening * 0.62));
  // Doors swing below the wall line, so lift the wall to leave room for the arc.
  const wallY = kind === 'door' ? (type === 'garage' || type === 'opening' || type === 'sliding' || type === 'pocket' ? 0 : opening * 0.24) : 0;
  const cs: CanvasState = { ctx, width: PREVIEW_W, height: PREVIEW_H, zoom, camX: 0, camY: 0 };
  // Faint drafting grid
  ctx.strokeStyle = '#eceee9'; ctx.lineWidth = 1;
  const step = 20 * zoom;
  for (let x = (PREVIEW_W / 2) % step; x < PREVIEW_W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, PREVIEW_H); ctx.stroke(); }
  for (let y = (PREVIEW_H / 2) % step; y < PREVIEW_H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PREVIEW_W, y); ctx.stroke(); }
  const wall: Wall = { id: 'preview', start: { x: -length / 2, y: wallY }, end: { x: length / 2, y: wallY }, thickness: 15, height: 260, color: '#e5e7eb' };
  drawWall(cs, wall, false, false, get(projectSettings));
  if (kind === 'door') {
    drawDoorOnWall(cs, wall, { id: 'p', wallId: 'preview', position: 0.5, width: opening, height: type === 'garage' ? 220 : 210, type: type as Door['type'], swingDirection: 'left', flipSide: true });
  } else {
    drawWindowOnWall(cs, wall, { id: 'p', wallId: 'preview', position: 0.5, width: opening, height: 120, sillHeight: 90, type: type as Win['type'] });
  }
  return canvas.toDataURL('image/png');
}

// ── 3D studio ───────────────────────────────────────────────────────────

let renderer: THREE.WebGLRenderer | null = null;
let envMap: THREE.Texture | null = null;

function studio(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(Math.round(PREVIEW_W * 1.5), Math.round(PREVIEW_H * 1.5), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return renderer;
}

function baseScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c6, 0.55));
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
  sun.position.set(260, 520, 420);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 6;
  const c = sun.shadow.camera as THREE.OrthographicCamera;
  c.left = -450; c.right = 450; c.top = 450; c.bottom = -450; c.near = 10; c.far = 1600;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  return scene;
}

const mat = {
  plaster: () => new THREE.MeshStandardMaterial({ color: 0xe7e1d7, roughness: 0.92 }),
  trim: () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }),
  oak: () => new THREE.MeshStandardMaterial({ map: woodTexture('#B07C4F', '#9A673D'), roughness: 0.55 }),
  oakDark: () => new THREE.MeshStandardMaterial({ map: woodTexture('#9D6B41', '#875833'), roughness: 0.55 }),
  metal: () => new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.28 }),
  blackMetal: () => new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.6, roughness: 0.4 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x7fb0cc, metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.62, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
  garage: () => new THREE.MeshStandardMaterial({ color: 0xe9eaec, metalness: 0.35, roughness: 0.45 }),
};

const textureCache = new Map<string, THREE.CanvasTexture>();
function woodTexture(a: string, b: string, planks = false): THREE.CanvasTexture {
  const key = `${a}${b}${planks}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = a; g.fillRect(0, 0, 256, 256);
  // Grain
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = b; g.globalAlpha = 0.08 + Math.random() * 0.18; g.lineWidth = 0.6 + Math.random() * 1.6;
    const x = Math.random() * 256;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, 80, x - 6, 170, x + 3, 256); g.stroke();
  }
  g.globalAlpha = 1;
  if (planks) {
    g.strokeStyle = 'rgba(60,35,15,.35)'; g.lineWidth = 1.2;
    for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (let x = 0; x < 256; x += 32) { const y = ((x * 7) % 256); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 32, y); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, t);
  return t;
}

function tileTexture(base: string, line: string): THREE.CanvasTexture {
  const key = `tile${base}${line}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = line; g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, t);
  return t;
}

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Wall with a rectangular hole: [left, right, lintel, under-sill] blocks + casing trim. */
function wallWithOpening(group: THREE.Group, width: number, top: number, sill: number, wallLen: number, cased = true) {
  const H = Math.max(260, top + 40), T = 15, plaster = mat.plaster(), trim = mat.trim();
  const side = (wallLen - width) / 2;
  group.add(box(side, H, T, plaster, -width / 2 - side / 2, H / 2, 0));
  group.add(box(side, H, T, plaster, width / 2 + side / 2, H / 2, 0));
  group.add(box(width, H - top, T, plaster, 0, top + (H - top) / 2, 0));
  if (sill > 0) group.add(box(width, sill, T, plaster, 0, sill / 2, 0));
  if (!cased) return;
  const cw = 7, cd = 2.5;
  group.add(box(cw, top - sill + cw, cd, trim, -width / 2 - cw / 2, sill + (top - sill + cw) / 2 - (sill ? cw / 2 : 0), T / 2 + cd / 2));
  group.add(box(cw, top - sill + cw, cd, trim, width / 2 + cw / 2, sill + (top - sill + cw) / 2 - (sill ? cw / 2 : 0), T / 2 + cd / 2));
  group.add(box(width + cw * 2, cw, cd, trim, 0, top + cw / 2, T / 2 + cd / 2));
  // Jamb liners
  group.add(box(2, top - sill, T, trim, -width / 2 + 1, sill + (top - sill) / 2, 0));
  group.add(box(2, top - sill, T, trim, width / 2 - 1, sill + (top - sill) / 2, 0));
  group.add(box(width, 2, T, trim, 0, top - 1, 0));
  if (sill > 0) group.add(box(width + 16, 4, T + 10, trim, 0, sill - 2, 4)); // window board
}

/** Panelled timber leaf hinged at its left edge (local origin), opening `angle` radians. */
function doorLeaf(w: number, h: number, angle: number, glazed = false, handleSide: 1 | -1 = 1): THREE.Group {
  const pivot = new THREE.Group();
  const leaf = new THREE.Group();
  leaf.position.x = handleSide === 1 ? w / 2 : -w / 2;
  const oak = mat.oak(), dark = mat.oakDark();
  const D = 4;
  if (glazed) {
    const s = 10;
    leaf.add(box(s, h, D, oak, -w / 2 + s / 2, h / 2, 0));
    leaf.add(box(s, h, D, oak, w / 2 - s / 2, h / 2, 0));
    leaf.add(box(w, s, D, oak, 0, s / 2, 0));
    leaf.add(box(w, 22, D, oak, 0, 11, 0));
    leaf.add(box(w, s, D, oak, 0, h - s / 2, 0));
    const gw = w - 2 * s, gh = h - 22 - s;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.8), mat.glass());
    glass.position.set(0, 22 + gh / 2, 0); leaf.add(glass);
    for (let i = 1; i < 4; i++) leaf.add(box(gw, 2.5, D - 1, oak, 0, 22 + (gh * i) / 4, 0));
    leaf.add(box(2.5, gh, D - 1, oak, 0, 22 + gh / 2, 0));
  } else {
    leaf.add(box(w, h, D, oak, 0, h / 2, 0));
    // Raised panels on the visible face
    const pw = w - 22, rows = [[18, h * 0.38], [h * 0.38 + 12, h - 18]];
    for (const [y0, y1] of rows) leaf.add(box(pw, y1 - y0, 1.2, dark, 0, (y0 + y1) / 2, D / 2 + 0.4));
    for (const [y0, y1] of rows) leaf.add(box(pw - 8, y1 - y0 - 8, 1.4, oak, 0, (y0 + y1) / 2, D / 2 + 0.9));
  }
  // Lever handle on both faces
  const hx = handleSide === 1 ? w / 2 - 7 : -w / 2 + 7, metal = mat.metal();
  for (const zs of [1, -1]) {
    leaf.add(box(3, 14, 1, metal, hx, 100, zs * (D / 2 + 0.6)));
    const lever = box(12, 1.8, 1.8, metal, hx - handleSide * 5, 104, zs * (D / 2 + 3));
    leaf.add(lever);
    leaf.add(box(1.8, 1.8, 3, metal, hx, 104, zs * (D / 2 + 1.6)));
  }
  pivot.add(leaf);
  pivot.rotation.y = angle;
  return pivot;
}

function buildDoor(type: Door['type']): { group: THREE.Group; width: number } {
  const group = new THREE.Group();
  const width = DOOR_WIDTH[type], top = type === 'garage' ? 220 : 210;
  const wallLen = width + 110;
  wallWithOpening(group, width, top, 0, wallLen, type !== 'garage');
  const L = -width / 2, R = width / 2;
  if (type === 'single') {
    const d = doorLeaf(width - 2, top - 2, 0.75); d.position.set(L + 1, 0, 6); group.add(d);
  } else if (type === 'double' || type === 'french') {
    const glazed = type === 'french', hw = width / 2 - 1;
    const a = doorLeaf(hw, top - 2, 0.55, glazed, 1); a.position.set(L + 1, 0, 6); group.add(a);
    const b = doorLeaf(hw, top - 2, -0.35, glazed, -1); b.position.set(R - 1, 0, 6); group.add(b);
  } else if (type === 'sliding') {
    const frame = mat.blackMetal(), pw = width / 2 + 4;
    group.add(box(width, 6, 12, frame, 0, top - 3, 0));
    for (const [x, z] of [[L + pw / 2 + 6, 3], [R - pw / 2 - 30, -3]] as const) {
      const p = new THREE.Group(); p.position.set(x, 0, z);
      p.add(box(5, top - 8, 4, frame, -pw / 2 + 2.5, (top - 8) / 2, 0));
      p.add(box(5, top - 8, 4, frame, pw / 2 - 2.5, (top - 8) / 2, 0));
      p.add(box(pw, 6, 4, frame, 0, 3, 0)); p.add(box(pw, 5, 4, frame, 0, top - 10.5, 0));
      const g = new THREE.Mesh(new THREE.BoxGeometry(pw - 10, top - 19, 0.8), mat.glass()); g.position.y = (top - 8) / 2 + 1; p.add(g);
      p.add(box(2, 30, 3, mat.metal(), pw / 2 - 8, 100, 2.5));
      group.add(p);
    }
  } else if (type === 'pocket') {
    // Leaf mostly drawn into the wall cavity, with a flush pull.
    const leaf = doorLeaf(width - 2, top - 2, 0); leaf.position.set(L - width * 0.45, 0, 0); group.add(leaf);
    group.add(box(2, top, 16, mat.trim(), L, top / 2, 0));
  } else if (type === 'bifold') {
    const n = 4, pw = (width - 4) / n, oak = mat.oak(), dark = mat.oakDark();
    for (let i = 0; i < n; i++) {
      const pair = Math.floor(i / 2), left = i % 2 === 0, fold = 0.55;
      const p = new THREE.Group();
      const baseX = pair === 0 ? L + 2 : R - 2 - pw * 2 * Math.cos(fold);
      const x = baseX + (left ? 0 : pw * Math.cos(fold));
      p.position.set(x, 0, 8 + (left ? 0 : pw * Math.sin(fold)));
      p.rotation.y = left ? fold : -fold;
      const leaf = box(pw - 1, top - 4, 3, oak, pw / 2, (top - 4) / 2, 0); p.add(leaf);
      for (let k = 0; k < 4; k++) p.add(box(pw - 14, 3, 0.8, dark, pw / 2, 40 + k * 40, 1.8));
      group.add(p);
    }
  } else if (type === 'garage') {
    const g = mat.garage(), groove = new THREE.MeshStandardMaterial({ color: 0xb9bcc1, metalness: 0.4, roughness: 0.5 });
    const sections = 4, sh = top / sections;
    for (let i = 0; i < sections; i++) {
      group.add(box(width, sh - 1.5, 4, g, 0, i * sh + sh / 2, 2));
      group.add(box(width, 1.5, 3.5, groove, 0, (i + 1) * sh - 0.75, 1.5));
      for (let k = 0; k < 2; k++) group.add(box(width - 30, 0.8, 0.8, groove, 0, i * sh + sh * (0.35 + k * 0.3), 4.4));
    }
    group.add(box(14, top + 10, 4, mat.trim(), -width / 2 - 7, (top + 10) / 2, 9));
    group.add(box(14, top + 10, 4, mat.trim(), width / 2 + 7, (top + 10) / 2, 9));
    group.add(box(width + 28, 12, 4, mat.trim(), 0, top + 4, 9));
    group.add(box(26, 2, 2, mat.blackMetal(), 0, 20, 5));
  }
  return { group, width: wallLen };
}

function sash(w: number, h: number, frame: THREE.Material, bars = 0): THREE.Group {
  const s = new THREE.Group(), f = 5, d = 5;
  s.add(box(f, h, d, frame, -w / 2 + f / 2, h / 2, 0)); s.add(box(f, h, d, frame, w / 2 - f / 2, h / 2, 0));
  s.add(box(w, f, d, frame, 0, f / 2, 0)); s.add(box(w, f, d, frame, 0, h - f / 2, 0));
  const g = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * f, h - 2 * f, 0.6), mat.glass()); g.position.y = h / 2; s.add(g);
  if (bars) { s.add(box(w - 2 * f, 2, 2.5, frame, 0, h / 2, 0)); s.add(box(2, h - 2 * f, 2.5, frame, 0, h / 2, 0)); }
  return s;
}

function buildWindow(type: Win['type']): { group: THREE.Group; width: number } {
  const group = new THREE.Group();
  const width = WINDOW_WIDTH[type], sill = 90, top = type === 'casement' ? 220 : type === 'bay' ? 240 : 210;
  const h = top - sill, wallLen = width + 110, frame = mat.trim();
  if (type === 'bay') {
    // Projecting bay: angled side lights and a deep seat board.
    wallWithOpening(group, width, top, sill, wallLen, true);
    const depth = 45, side = Math.hypot(depth, 40), front = width - 80;
    const f = sash(front, h, frame, 0); f.position.set(0, sill, depth + 5); group.add(f);
    for (const sgn of [-1, 1]) {
      const s = sash(side, h, frame); s.position.set(sgn * (front / 2 + 20), sill, depth / 2 + 5);
      s.rotation.y = -sgn * (Math.PI / 2 - Math.atan2(40, depth));
      group.add(s);
    }
    group.add(box(width + 6, 5, depth + 18, mat.trim(), 0, sill - 2.5, depth / 2 + 4));
    group.add(box(width + 6, 5, depth + 18, mat.trim(), 0, top + 2.5, depth / 2 + 4));
    return { group, width: wallLen };
  }
  wallWithOpening(group, width, top, sill, wallLen, true);
  if (type === 'standard') {
    // Double-hung: lower sash raised a little in front of the upper one.
    const a = sash(width - 4, h / 2 + 3, frame, 0); a.position.set(0, sill + h / 2 - 3, -2); group.add(a);
    const b = sash(width - 4, h / 2 + 3, frame, 0); b.position.set(0, sill + 14, 3); group.add(b);
  } else if (type === 'fixed') {
    const a = sash(width - 4, h - 2, frame, 0); a.position.set(0, sill + 1, 0); group.add(a);
  } else if (type === 'casement') {
    const pivot = new THREE.Group(); pivot.position.set(-width / 2 + 2, sill + 1, 5);
    const s = sash(width - 4, h - 2, frame, 1); s.position.x = (width - 4) / 2; pivot.add(s);
    pivot.rotation.y = 0.7; group.add(pivot);
    pivot.add(box(2, 10, 2, mat.metal(), width - 10, h / 2, 4));
  } else if (type === 'sliding') {
    const pw = width / 2 + 4;
    const a = sash(pw, h - 2, frame); a.position.set(-width / 4 + 1, sill + 1, -2.5); group.add(a);
    const b = sash(pw, h - 2, frame); b.position.set(width / 4 - 18, sill + 1, 2.5); group.add(b);
  }
  return { group, width: wallLen };
}

function shoot(scene: THREE.Scene, camera: THREE.Camera, pad = 0.07): string {
  const r = studio();
  r.setClearColor(0x000000, 0);
  r.render(scene, camera);
  const src = r.domElement, w = src.width, h = src.height;
  const probe = document.createElement('canvas'); probe.width = w; probe.height = h;
  const pc = probe.getContext('2d', { willReadFrequently: true })!;
  pc.drawImage(src, 0, 0);
  const data = pc.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (data[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return src.toDataURL('image/png');
  const out = document.createElement('canvas'); out.width = PREVIEW_W * 2; out.height = PREVIEW_H * 2;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const scale = Math.min(out.width * (1 - pad * 2) / bw, out.height * (1 - pad * 2) / bh);
  const dw = bw * scale, dh = bh * scale;
  const oc = out.getContext('2d')!;
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(src, x0, y0, bw, bh, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
  return out.toDataURL('image/png');
}

function disposeScene(scene: THREE.Scene) {
  const furniture: THREE.Object3D[] = [];
  scene.traverse(o => { if (o.userData.furniture) furniture.push(o); });
  for (const f of furniture) { f.removeFromParent(); disposeModel(f as THREE.Group); }
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}

function shadowGround(scene: THREE.Scene, size = 900) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
}

function openingRender(kind: 'door' | 'window', type: string): string {
  studio();
  const scene = baseScene();
  const { group, width } = kind === 'door' ? buildDoor(type as Door['type']) : buildWindow(type as Win['type']);
  scene.add(group);
  shadowGround(scene);
  const box3 = new THREE.Box3().setFromObject(group);
  const center = box3.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(30, PREVIEW_W / PREVIEW_H, 1, 5000);
  const dist = Math.max(width * 1.0, box3.max.y * 1.35) / Math.tan((30 * Math.PI) / 360) * 0.62;
  camera.position.set(center.x + dist * 0.42, center.y + dist * 0.12, dist * 0.92);
  camera.lookAt(center.x, center.y - 4, 0);
  const url = shoot(scene, camera);
  disposeScene(scene);
  return url;
}

// ── Furnished room templates ────────────────────────────────────────────

const ROOM_W = 400, ROOM_D = 300;
const TILED = new Set(['Kitchen', 'Bathroom']);

async function furnitureObject(catalogId: string): Promise<THREE.Object3D | null> {
  const def = getCatalogItem(catalogId);
  if (!def) return null;
  const file = getModelFile(catalogId);
  if (file) {
    const model = await loadCatalogModel(file).catch(() => null);
    if (model) {
      try { fitFurnitureModel(model, def); return model; } catch { disposeModel(model); }
    }
  }
  return createFurnitureModel(catalogId, def);
}

async function roomRender(name: string): Promise<string | null> {
  const template = roomTemplates.find(t => t.name === name);
  if (!template) return null;
  studio();
  const scene = baseScene();
  const room = new THREE.Group();
  scene.add(room);
  const floorTex = TILED.has(name) ? tileTexture(name === 'Bathroom' ? '#B9CCD4' : '#CFC6B8', name === 'Bathroom' ? '#8FA6B0' : '#A99D8C') : woodTexture('#B4804F', '#8E5F35', true).clone();
  floorTex.repeat.set(ROOM_W / 100, ROOM_D / 100); floorTex.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 4, ROOM_D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
  floor.position.y = -2; floor.receiveShadow = true; room.add(floor);
  // Cut-away shell: two full back walls, two low front walls (dollhouse view).
  const T = 12, H = 150, low = 16, plaster = mat.plaster(), cap = new THREE.MeshStandardMaterial({ color: 0x3f4a42, roughness: 0.7 });
  room.add(box(ROOM_W + T * 2, H, T, plaster, 0, H / 2, -ROOM_D / 2 - T / 2));
  room.add(box(T, H, ROOM_D, plaster, -ROOM_W / 2 - T / 2, H / 2, 0));
  room.add(box(ROOM_W + T * 2, low, T, plaster, 0, low / 2, ROOM_D / 2 + T / 2));
  room.add(box(T, low, ROOM_D, plaster, ROOM_W / 2 + T / 2, low / 2, 0));
  // Dark section caps on the cut tops read as an architectural model.
  room.add(box(ROOM_W + T * 2, 1.5, T, cap, 0, H + 0.75, -ROOM_D / 2 - T / 2));
  room.add(box(T, 1.5, ROOM_D, cap, -ROOM_W / 2 - T / 2, H + 0.75, 0));
  room.add(box(ROOM_W + T * 2, 1.5, T, cap, 0, low + 0.75, ROOM_D / 2 + T / 2));
  room.add(box(T, 1.5, ROOM_D, cap, ROOM_W / 2 + T / 2, low + 0.75, 0));
  // Skirting
  const skirt = mat.trim();
  room.add(box(ROOM_W, 8, 1.5, skirt, 0, 4, -ROOM_D / 2 + 0.75));
  room.add(box(1.5, 8, ROOM_D, skirt, -ROOM_W / 2 + 0.75, 4, 0));
  const items = await Promise.all(template.furniture.map(f => furnitureObject(f.catalogId)));
  template.furniture.forEach((f, i) => {
    const obj = items[i];
    if (!obj) return;
    const holder = new THREE.Group();
    holder.add(obj);
    obj.userData.furniture = true;
    holder.position.set(f.x, 0, f.y);
    holder.rotation.y = -(f.rotation * Math.PI) / 180;
    obj.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    room.add(holder);
  });
  shadowGround(scene, 1400);
  const camera = new THREE.PerspectiveCamera(28, PREVIEW_W / PREVIEW_H, 1, 6000);
  camera.position.set(520, 560, 700);
  camera.lookAt(0, 10, 0);
  // Frame the room tightly.
  camera.zoom = 1.05; camera.updateProjectionMatrix();
  const url = shoot(scene, camera);
  disposeScene(scene);
  return url;
}

// ── Public API ──────────────────────────────────────────────────────────

export type PreviewKind = 'door' | 'window' | 'room';

export function catalogPreview(kind: PreviewKind, type: string, mode: '2d' | '3d'): Promise<string | null> {
  const key = `${kind}:${type}:${mode}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      try {
        if (kind === 'room') return await roomRender(type);
        return mode === '2d' ? planPreview(kind, type) : openingRender(kind, type);
      } catch (error) {
        console.warn('[catalogPreviews] Preview unavailable:', key, error);
        return null;
      }
    })();
    cache.set(key, hit);
  }
  return hit;
}
