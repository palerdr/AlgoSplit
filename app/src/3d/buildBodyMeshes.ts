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

function lerpHex(a: string, b: string, t: number): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const mix = (i: number) => {
    const va = parseInt(pa.slice(i, i + 2), 16);
    const vb = parseInt(pb.slice(i, i + 2), 16);
    return Math.round(va + (vb - va) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

/**
 * Blend region colors between two stimulus states (t: 0 = from, 1 = to) so a
 * data source switch crossfades instead of flashing.
 */
export function updateSegmentedBodyColorsBlended(
  data: SegmentedBodyData,
  fromLevels: Record<string, number>,
  toLevels: Record<string, number>,
  t: number
): void {
  const clamped = Math.min(1, Math.max(0, t));
  for (const [regionId, meshes] of Object.entries(data.regionMeshes)) {
    const hex = lerpHex(
      getRegionHex(regionId, fromLevels),
      getRegionHex(regionId, toLevels),
      clamped
    );
    for (const mesh of meshes) {
      applyMeshColor(mesh, hex);
    }
  }
}
