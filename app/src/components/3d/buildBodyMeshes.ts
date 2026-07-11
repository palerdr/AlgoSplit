import * as THREE from 'three';
import { getRegionHex, NEUTRAL_HEX, VISIBLE_REGION_IDS } from './regionColors';

// ─── Types ───────────────────────────────────────────────────────

export interface ColoredBodyData {
  geometry: THREE.BufferGeometry;
  faceRegions: string[];  // one region per face (every 3 vertices)
}

export interface BodyPartGeometry {
  name: string;
  geometry: THREE.BufferGeometry;
}

export interface SegmentedBodyData {
  group: THREE.Group;
  regionMeshes: Record<string, THREE.Mesh[]>;
  neutralMeshes: THREE.Mesh[];
}

const VISIBLE_REGION_ID_SET = new Set<string>(VISIBLE_REGION_IDS);

const BODY_MATERIAL_BASE = {
  flatShading: false,
  shininess: 2,
  specular: new THREE.Color(0x111111),
  side: THREE.DoubleSide,
} as const;

function createBodyMaterial(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    ...BODY_MATERIAL_BASE,
    color: new THREE.Color(NEUTRAL_HEX),
    vertexColors: true,
    transparent: false,
    opacity: 1,
  });
}

function applyMeshColor(mesh: THREE.Mesh, hex: string): void {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color(hex);

  for (let i = 0; i < position.count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const colorAttribute = geometry.getAttribute('color') as THREE.BufferAttribute;
  colorAttribute.needsUpdate = true;
}

export function normalizeRegionObjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  if (trimmed === 'neutral_body') return trimmed;

  let normalized = trimmed.replace(/\.\d+$/, '');
  if (!VISIBLE_REGION_ID_SET.has(normalized)) {
    normalized = normalized.replace(/\d+$/, '');
  }

  return normalized;
}

export function buildSegmentedBody(
  parts: BodyPartGeometry[],
  stimulusLevels: Record<string, number>
): SegmentedBodyData {
  const group = new THREE.Group();
  const regionMeshes: Record<string, THREE.Mesh[]> = {};
  const neutralMeshes: THREE.Mesh[] = [];

  for (const part of parts) {
    const regionId = normalizeRegionObjectName(part.name);
    const isRegion = VISIBLE_REGION_ID_SET.has(regionId);
    const material = createBodyMaterial();

    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.name = part.name;
    mesh.frustumCulled = false;
    mesh.userData.regionId = isRegion ? regionId : null;
    applyMeshColor(mesh, isRegion ? getRegionHex(regionId, stimulusLevels) : NEUTRAL_HEX);

    if (isRegion) {
      regionMeshes[regionId] ??= [];
      regionMeshes[regionId].push(mesh);
    } else {
      neutralMeshes.push(mesh);
    }

    group.add(mesh);
  }

  return { group, regionMeshes, neutralMeshes };
}

export function updateSegmentedBodyColors(
  data: SegmentedBodyData,
  stimulusLevels: Record<string, number>
): void {
  for (const [regionId, meshes] of Object.entries(data.regionMeshes)) {
    const hex = getRegionHex(regionId, stimulusLevels);
    for (const mesh of meshes) {
      applyMeshColor(mesh, hex);
    }
  }

  for (const mesh of data.neutralMeshes) {
    applyMeshColor(mesh, NEUTRAL_HEX);
  }
}

// ─── Fallback face classifier for unsegmented body meshes ───────
// Coordinates: Y-up, centered at origin, front = +Z, right = +X.
// This remains a geometric fallback for single-mesh assets. When the
// GLB is later re-exported with authored per-region submeshes/groups,
// this classifier can be bypassed entirely.

// Approximate torso half-width at a given normalized height
function getTorsoHalfWidth(ny: number): number {
  if (ny > 0.82) return 0.12; // neck
  if (ny > 0.78) return 0.30; // shoulder line
  if (ny > 0.65) return 0.24; // chest
  if (ny > 0.50) return 0.19; // waist
  if (ny > 0.40) return 0.20; // lower waist
  return 0.22; // hips
}

function classifyBodyVertex(
  x: number,
  y: number,
  z: number,
  minY: number,
  height: number
): string {
  const ny = (y - minY) / height; // 0 = feet, 1 = head top
  const ax = Math.abs(x);
  const front = z > 0;

  // ── Head + neck: top ~15% ──
  if (ny > 0.85) return '';

  // ── Arm detection ──
  // Arms extend from shoulder level down to about hip level
  const torsoW = getTorsoHalfWidth(ny);
  const isArm = ny > 0.35 && ny < 0.82 && ax > torsoW;

  if (isArm) {
    // Shoulder cap / deltoids
    if (ny > 0.75) {
      if (front) return 'anterior_deltoid';
      if (z < -0.02) return 'posterior_deltoid';
      return 'lateral_deltoid';
    }
    // Upper arm
    if (ny > 0.58) {
      if (front) return ny > 0.68 ? 'biceps_brachii' : 'brachialis';
      return ny > 0.68 ? 'triceps_long_head' : 'triceps_lateral_medial';
    }
    // Forearm
    if (ny > 0.42) {
      if (front) return 'wrist_flexors';
      if (z > -0.01 && ax > torsoW + 0.06) return 'brachioradialis';
      return 'wrist_extensors';
    }
    // Hand (decorative)
    return '';
  }

  // ── Legs: below hip crease ──
  if (ny < 0.35) {
    // Upper thigh
    if (ny > 0.20) {
      if (front) {
        if (ax < 0.06) return 'rectus_femoris';
        return 'vasti';
      }
      if (ax < 0.04 && z > -0.02) return 'hip_adductors';
      return ny > 0.27 ? 'hip_extensors' : 'knee_flexors';
    }
    // Lower thigh / knee
    if (ny > 0.13) {
      if (front) return 'vasti';
      return 'knee_flexors';
    }
    // Calf
    if (ny > 0.04) {
      if (!front) return ny > 0.09 ? 'gastrocnemius' : 'soleus';
      return ''; // shin (decorative)
    }
    // Ankle / foot
    return '';
  }

  // ── Torso: 0.35 ≤ ny ≤ 0.85 ──

  // Shoulder / upper chest line
  if (ny > 0.75) {
    if (ax > 0.18) {
      if (front) return 'anterior_deltoid';
      if (z < -0.03) return 'posterior_deltoid';
      return 'lateral_deltoid';
    }
    if (front) return 'clavicular';
    return 'trapezius';
  }

  // Upper chest / upper back
  if (ny > 0.62) {
    if (ax > 0.20) {
      if (front) return 'anterior_deltoid';
      return 'posterior_deltoid';
    }
    if (front) {
      return ny > 0.70 ? 'clavicular' : 'sternocostal';
    }
    if (ax > 0.12) return 'thoracic_lats';
    if (ax > 0.05) return 'rhomboids';
    return 'spinal_erectors';
  }

  // Mid torso
  if (ny > 0.48) {
    if (front) {
      if (ax < 0.06) return 'anterior_core';
      if (ax < 0.15) return 'lateral_core';
      return 'sternocostal';
    }
    if (ax > 0.10) return ny > 0.55 ? 'thoracic_lats' : 'iliac_lats';
    if (ax > 0.04) return 'iliac_lats';
    return 'spinal_erectors';
  }

  // Lower torso / waist
  if (ny > 0.40) {
    if (front) {
      if (ax < 0.06) return 'anterior_core';
      return 'lateral_core';
    }
    if (ax > 0.08) return 'iliac_lats';
    return 'spinal_erectors';
  }

  // Hip / glute area
  if (front) {
    if (ax < 0.07) return 'anterior_core';
    return 'lateral_core';
  }
  if (ax > 0.14) return 'glute_med_min';
  return 'glute_max';
}

// ─── Apply per-face colors (centroid-based classification) ───────

export function applyBodyColors(
  geometry: THREE.BufferGeometry,
  stimulusLevels: Record<string, number>
): ColoredBodyData {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = posAttr.count;
  const faceCount = count / 3;

  // Compute bounding box for normalization
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const minY = bb.min.y;
  const height = bb.max.y - bb.min.y;

  const colors = new Float32Array(count * 3);
  const faceRegions: string[] = [];

  for (let f = 0; f < faceCount; f++) {
    const i0 = f * 3;
    const i1 = f * 3 + 1;
    const i2 = f * 3 + 2;

    // Compute face centroid
    const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
    const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
    const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;

    const regionId = classifyBodyVertex(cx, cy, cz, minY, height);
    faceRegions.push(regionId);

    const hex = regionId ? getRegionHex(regionId, stimulusLevels) : NEUTRAL_HEX;
    const c = new THREE.Color(hex);

    // Set all 3 vertices of this face to the same color
    for (const vi of [i0, i1, i2]) {
      colors[vi * 3] = c.r;
      colors[vi * 3 + 1] = c.g;
      colors[vi * 3 + 2] = c.b;
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return { geometry, faceRegions };
}

// ─── Color update (no geometry re-creation) ──────────────────────

export function updateBodyColors(
  data: ColoredBodyData,
  stimulusLevels: Record<string, number>
): void {
  const colorAttr = data.geometry.getAttribute('color') as THREE.BufferAttribute;
  for (let f = 0; f < data.faceRegions.length; f++) {
    const regionId = data.faceRegions[f];
    const hex = regionId ? getRegionHex(regionId, stimulusLevels) : NEUTRAL_HEX;
    const c = new THREE.Color(hex);

    // Set all 3 vertices of this face to the same color
    const i0 = f * 3;
    colorAttr.setXYZ(i0, c.r, c.g, c.b);
    colorAttr.setXYZ(i0 + 1, c.r, c.g, c.b);
    colorAttr.setXYZ(i0 + 2, c.r, c.g, c.b);
  }
  colorAttr.needsUpdate = true;
}
