import * as THREE from 'three';
import { getRegionHex, NEUTRAL_HEX, VISIBLE_REGION_IDS } from './regionColors';

export interface BodyPartGeometry {
  name: string;
  geometry: THREE.BufferGeometry;
}

export interface SegmentedBodyData {
  group: THREE.Group;
  regionMeshes: Record<string, THREE.Mesh[]>;
  neutralMeshes: THREE.Mesh[];
}

export type SegmentedBodyColorSnapshot = Record<string, THREE.Color>;

const VISIBLE_REGION_ID_SET = new Set<string>(VISIBLE_REGION_IDS);

const BODY_MATERIAL_BASE = {
  flatShading: false,
  shininess: 2,
  specular: new THREE.Color(0x111111),
  side: THREE.DoubleSide,
} as const;

function createBodyMaterial(hex: string): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    ...BODY_MATERIAL_BASE,
    color: new THREE.Color(hex),
    vertexColors: false,
    transparent: false,
    opacity: 1,
  });
}

function getBodyMaterial(mesh: THREE.Mesh): THREE.MeshPhongMaterial {
  const material = mesh.material;
  if (Array.isArray(material) || !(material instanceof THREE.MeshPhongMaterial)) {
    throw new Error('Segmented body mesh must use one Phong material');
  }
  return material;
}

function applyMeshColor(mesh: THREE.Mesh, color: string | THREE.Color): void {
  const material = getBodyMaterial(mesh);
  if (color instanceof THREE.Color) {
    material.color.copy(color);
  } else {
    material.color.set(color);
  }
}

// GLB object names carry export suffixes like "biceps_brachii.001" — strip
// them back to canonical region IDs.
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
    const material = createBodyMaterial(
      isRegion ? getRegionHex(regionId, stimulusLevels) : NEUTRAL_HEX
    );

    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.name = part.name;
    mesh.frustumCulled = false;
    mesh.userData.regionId = isRegion ? regionId : null;

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

/** Captures the exact colors currently displayed so retargeted tweens do not jump. */
export function snapshotSegmentedBodyColors(
  data: SegmentedBodyData
): SegmentedBodyColorSnapshot {
  const snapshot: SegmentedBodyColorSnapshot = {};
  for (const [regionId, meshes] of Object.entries(data.regionMeshes)) {
    const firstMesh = meshes[0];
    if (firstMesh) snapshot[regionId] = getBodyMaterial(firstMesh).color.clone();
  }
  return snapshot;
}

/**
 * Animates each muscle as one solid Phong color. This keeps every anatomical
 * border pixel-sharp throughout the post-workout data handoff.
 */
export function updateSegmentedBodyColorTransition(
  data: SegmentedBodyData,
  fromColors: SegmentedBodyColorSnapshot,
  toLevels: Record<string, number>,
  t: number
): void {
  const clamped = Math.min(1, Math.max(0, t));
  const target = new THREE.Color();
  const displayed = new THREE.Color();

  for (const [regionId, meshes] of Object.entries(data.regionMeshes)) {
    const firstMesh = meshes[0];
    if (!firstMesh) continue;
    const from = fromColors[regionId] ?? getBodyMaterial(firstMesh).color;
    target.set(getRegionHex(regionId, toLevels));
    displayed.copy(from).lerp(target, clamped);
    for (const mesh of meshes) {
      applyMeshColor(mesh, displayed);
    }
  }

  for (const mesh of data.neutralMeshes) {
    applyMeshColor(mesh, NEUTRAL_HEX);
  }
}
