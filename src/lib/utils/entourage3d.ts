import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { EntourageItem } from '$lib/models/types';
import { entourageCatalog } from '$lib/utils/entourageCatalog';

/**
 * 3D stand-ins for the built-in 2D entourage symbols (people, vehicles,
 * planting, outdoor), built from simple shapes in the same stylised look as
 * the viewer's landscape. Units are cm; the model's local x runs along the
 * symbol's width and local z along its depth (width × aspect), ground at y = 0.
 * Custom uploaded symbols stay 2D-only and return null.
 */

const mat = (color: number | string, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ── Vehicles ───────────────────────────────────────────────────────────
type CarKind = 'sedan' | 'suv' | 'pickup';
const CAR: Record<CarKind, { height: number; wheel: number; paint: number }> = {
  sedan: { height: 145, wheel: 32, paint: 0x2f4a6d },
  suv: { height: 175, wheel: 38, paint: 0xe7e4dd },
  pickup: { height: 182, wheel: 39, paint: 0x3b3f44 },
};

function car(kind: CarKind, length: number, width: number): THREE.Group {
  const spec = CAR[kind];
  const g = new THREE.Group();
  const paint = mat(spec.paint, { roughness: 0.35, metalness: 0.45 });
  const glass = mat(0x1d2733, { roughness: 0.08, metalness: 0.4 });
  const tyre = mat(0x1b1b1b, { roughness: 0.9 });
  const hub = mat(0xb9bcc0, { roughness: 0.3, metalness: 0.8 });
  const clearance = spec.wheel * 0.55;
  const bodyH = spec.height * 0.4;
  const cabinH = spec.height - clearance - bodyH;

  g.add(mesh(new RoundedBoxGeometry(length, bodyH, width, 3, 14), paint, 0, clearance + bodyH / 2, 0));

  if (kind === 'pickup') {
    // Cab at the front, open bed behind.
    const cabL = length * 0.36;
    g.add(mesh(new RoundedBoxGeometry(cabL, cabinH, width * 0.9, 3, 12), glass, length * 0.12, clearance + bodyH + cabinH / 2, 0));
    g.add(mesh(new RoundedBoxGeometry(cabL * 0.96, 6, width * 0.9, 2, 3), paint, length * 0.12, clearance + bodyH + cabinH, 0));
    const bedL = length * 0.42, wall = 6, bedH = 38, bedX = -length * 0.27, top = clearance + bodyH;
    g.add(mesh(new THREE.BoxGeometry(bedL, bedH, wall), paint, bedX, top + bedH / 2, width / 2 - wall / 2));
    g.add(mesh(new THREE.BoxGeometry(bedL, bedH, wall), paint, bedX, top + bedH / 2, -width / 2 + wall / 2));
    g.add(mesh(new THREE.BoxGeometry(wall, bedH, width), paint, bedX - bedL / 2 + wall / 2, top + bedH / 2, 0));
  } else {
    const cabL = length * (kind === 'suv' ? 0.66 : 0.5);
    const cabX = -length * (kind === 'suv' ? 0.06 : 0.03);
    g.add(mesh(new RoundedBoxGeometry(cabL, cabinH, width * 0.86, 3, 14), glass, cabX, clearance + bodyH + cabinH / 2, 0));
    g.add(mesh(new RoundedBoxGeometry(cabL * 0.94, 6, width * 0.84, 2, 3), paint, cabX, clearance + bodyH + cabinH, 0));
  }

  // Wheels and lights (front is +x).
  const tyreGeo = new THREE.CylinderGeometry(spec.wheel, spec.wheel, 24, 20).rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(spec.wheel * 0.5, spec.wheel * 0.5, 25, 14).rotateX(Math.PI / 2);
  for (const x of [length * 0.32, -length * 0.3]) for (const z of [width / 2 - 14, -width / 2 + 14]) {
    g.add(mesh(tyreGeo, tyre, x, spec.wheel, z));
    g.add(mesh(hubGeo, hub, x, spec.wheel, z));
  }
  const head = mat(0xfff6dc, { emissive: 0x3a3320, roughness: 0.2 });
  const tail = mat(0xa3171d, { emissive: 0x2a0406, roughness: 0.3 });
  for (const z of [width * 0.33, -width * 0.33]) {
    g.add(mesh(new THREE.BoxGeometry(4, 12, 26), head, length / 2 - 1, clearance + bodyH * 0.72, z));
    g.add(mesh(new THREE.BoxGeometry(4, 12, 26), tail, -length / 2 + 1, clearance + bodyH * 0.72, z));
  }
  return g;
}

// ── People ─────────────────────────────────────────────────────────────
function person(height: number, shoulders: number, shirt: number, trousers: number): THREE.Group {
  const g = new THREE.Group();
  const skin = mat(0xc99a7a, { roughness: 0.7 });
  const legH = height * 0.47, torsoH = height * 0.32, headR = height * 0.065;
  const legGeo = new THREE.CylinderGeometry(shoulders * 0.13, shoulders * 0.11, legH, 10);
  for (const z of [shoulders * 0.14, -shoulders * 0.14]) g.add(mesh(legGeo, mat(trousers), 0, legH / 2, z));
  const torso = mesh(new THREE.CapsuleGeometry(shoulders * 0.26, torsoH - shoulders * 0.5, 6, 12), mat(shirt), 0, legH + torsoH / 2, 0);
  torso.scale.set(0.62, 1, 1.25); // flatter front-to-back than side-to-side
  g.add(torso);
  g.add(mesh(new THREE.SphereGeometry(headR, 16, 12), skin, 0, legH + torsoH + headR * 1.1, 0));
  return g;
}

// ── Planting and outdoor ───────────────────────────────────────────────
const FOLIAGE = [0x4d6b33, 0x5a7a3a, 0x42602c, 0x66833f];
const leaf = (i: number) => mat(FOLIAGE[i % FOLIAGE.length], { roughness: 0.88, flatShading: true });

function deciduous(diameter: number): THREE.Group {
  const g = new THREE.Group();
  const r = diameter / 2;
  const trunkH = Math.max(160, diameter * 0.55);
  g.add(mesh(new THREE.CylinderGeometry(r * 0.07, r * 0.11, trunkH, 8), mat(0x6b513d, { roughness: 0.95 }), 0, trunkH / 2, 0));
  const crown = new THREE.IcosahedronGeometry(r * 0.72, 1);
  const blobs: [number, number, number, number][] = [[0, trunkH + r * 0.45, 0, 1], [r * 0.38, trunkH + r * 0.2, r * 0.1, 0.7], [-r * 0.32, trunkH + r * 0.25, -r * 0.22, 0.75], [r * 0.05, trunkH + r * 0.15, r * 0.4, 0.65]];
  blobs.forEach(([x, y, z, s], i) => { const m = mesh(crown, leaf(i), x, y, z); m.scale.setScalar(s); m.rotation.set(i, i * 2, i * 3); g.add(m); });
  return g;
}

function conifer(diameter: number): THREE.Group {
  const g = new THREE.Group();
  const r = diameter / 2;
  g.add(mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.1, 90, 8), mat(0x5e4634), 0, 45, 0));
  [[1, 70], [0.78, 150], [0.54, 225]].forEach(([s, y], i) =>
    g.add(mesh(new THREE.ConeGeometry(r * s, r * 1.3, 9), leaf(i + 2), 0, y + r * 0.65, 0)));
  return g;
}

function shrub(diameter: number): THREE.Group {
  const g = new THREE.Group();
  const m = mesh(new THREE.IcosahedronGeometry(diameter / 2, 1), leaf(1), 0, diameter * 0.3, 0);
  m.scale.set(1, 0.7, 1);
  g.add(m);
  return g;
}

function hedge(length: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(length, 110, Math.max(depth, 40), 3, 16), mat(0x4f6d34, { roughness: 0.95 }), 0, 55, 0));
  return g;
}

function pottedPlant(diameter: number): THREE.Group {
  const g = new THREE.Group();
  const potH = diameter * 0.55;
  g.add(mesh(new THREE.CylinderGeometry(diameter * 0.32, diameter * 0.24, potH, 16), mat(0xb76e4b, { roughness: 0.85 }), 0, potH / 2, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(diameter * 0.45, 1), leaf(0), 0, potH + diameter * 0.3, 0));
  return g;
}

function grassTuft(diameter: number): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.ConeGeometry(2.2, 1, 4);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, d = (i % 3) * diameter * 0.12;
    const h = 22 + (i * 7) % 18;
    const m = mesh(blade, leaf(i), Math.cos(a) * d, h / 2, Math.sin(a) * d);
    m.scale.y = h;
    m.rotation.z = Math.cos(a) * 0.25;
    m.rotation.x = Math.sin(a) * 0.25;
    g.add(m);
  }
  return g;
}

function umbrella(diameter: number): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(0x8a8078, { roughness: 0.4, metalness: 0.6 });
  g.add(mesh(new THREE.CylinderGeometry(24, 28, 8, 20), mat(0x5a524b), 0, 4, 0));
  g.add(mesh(new THREE.CylinderGeometry(2.5, 2.5, 235, 8), metal, 0, 118, 0));
  const canopy = mesh(new THREE.ConeGeometry(diameter / 2, 48, 8, 1, true), mat(0xefe7d8, { side: THREE.DoubleSide, roughness: 0.9 }), 0, 222, 0);
  g.add(canopy);
  return g;
}

/** Build a 3D model for a placed entourage item, or null for custom/unknown symbols. */
export function createEntourageModel(item: EntourageItem): THREE.Group | null {
  const def = entourageCatalog.find(d => d.id === item.defId);
  if (!def) return null;
  const w = item.width, d = item.width * def.aspect;
  let model: THREE.Group;
  switch (def.id) {
    case 'car-sedan': model = car('sedan', w, d); break;
    case 'car-suv': model = car('suv', w, d); break;
    case 'car-pickup': model = car('pickup', w, d); break;
    case 'person': model = person(172, w, 0x3f5a7a, 0x2f2d2b); break;
    case 'people-pair': {
      model = new THREE.Group();
      const a = person(174, w * 0.5, 0x8b5a3c, 0x33302d); a.position.x = -w * 0.24;
      const b = person(163, w * 0.46, 0x9aa98f, 0x44403b); b.position.x = w * 0.24;
      model.add(a, b);
      break;
    }
    case 'tree-deciduous': model = deciduous(w); break;
    case 'tree-conifer': model = conifer(w); break;
    case 'shrub': model = shrub(w); break;
    case 'hedge': model = hedge(w, d); break;
    case 'potted-plant': model = pottedPlant(w); break;
    case 'grass-tuft': model = grassTuft(w); break;
    case 'patio-umbrella': model = umbrella(w); break;
    default: return null;
  }
  model.position.set(item.position.x, 0, item.position.y);
  model.rotation.y = -(item.rotation * Math.PI) / 180;
  model.userData.entourageId = item.id;
  model.userData.excludeFromSite = true;
  return model;
}
