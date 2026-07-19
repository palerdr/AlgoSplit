import * as THREE from 'three';
import {
  NEUTRAL_HEX,
  UNTRAINED_BODY_HEX,
  VISIBLE_REGION_IDS,
} from './regionColors';
import {
  configureBodyHeatFieldMaterial,
  createBodyHeatCompositeUniforms,
  setBodyHeatLevelAttribute,
  type BodyHeatCompositeUniforms,
} from './bodyHeatField';

export interface BodyPartGeometry {
  name: string;
  geometry: THREE.BufferGeometry;
}

export interface SegmentedBodyData {
  group: THREE.Group;
  regionMeshes: Record<string, THREE.Mesh[]>;
  neutralMeshes: THREE.Mesh[];
  heatUniforms: BodyHeatCompositeUniforms;
}

const VISIBLE_REGION_ID_SET = new Set<string>(VISIBLE_REGION_IDS);

const BODY_MATERIAL_BASE = {
  flatShading: false,
  shininess: 2,
  specular: new THREE.Color(0x111111),
  side: THREE.DoubleSide,
} as const;

function createBodyMaterial(
  isRegion: boolean,
  heatUniforms: BodyHeatCompositeUniforms
): THREE.MeshPhongMaterial {
  const material = new THREE.MeshPhongMaterial({
    ...BODY_MATERIAL_BASE,
    color: new THREE.Color(isRegion ? UNTRAINED_BODY_HEX : NEUTRAL_HEX),
    vertexColors: false,
    transparent: false,
    opacity: 1,
  });
  configureBodyHeatFieldMaterial(material, heatUniforms);
  return material;
}

function normalizedStimulusLevel(
  regionId: string,
  stimulusLevels: Record<string, number>
): number {
  const raw = stimulusLevels[regionId];
  return Number.isFinite(raw) ? Math.min(7, Math.max(0, raw)) / 7 : 0;
}

function applyMeshHeatLevel(
  mesh: THREE.Mesh,
  regionId: string | null,
  stimulusLevels: Record<string, number>
): void {
  setBodyHeatLevelAttribute(
    mesh.geometry,
    regionId ? normalizedStimulusLevel(regionId, stimulusLevels) : 0
  );
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
  const heatUniforms = createBodyHeatCompositeUniforms();
  const renderParts = parts.map((part) => ({
    name: part.name,
    geometry: part.geometry.index ? part.geometry.toNonIndexed() : part.geometry,
  }));

  for (let partIndex = 0; partIndex < renderParts.length; partIndex++) {
    const part = renderParts[partIndex];
    const regionId = normalizeRegionObjectName(part.name);
    const isRegion = VISIBLE_REGION_ID_SET.has(regionId);
    const material = createBodyMaterial(isRegion, heatUniforms);

    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.name = part.name;
    mesh.frustumCulled = false;
    mesh.userData.regionId = isRegion ? regionId : null;
    applyMeshHeatLevel(mesh, isRegion ? regionId : null, stimulusLevels);

    if (isRegion) {
      regionMeshes[regionId] ??= [];
      regionMeshes[regionId].push(mesh);
    } else {
      neutralMeshes.push(mesh);
    }

    group.add(mesh);
  }

  return { group, regionMeshes, neutralMeshes, heatUniforms };
}

export function updateSegmentedBodyHeatLevels(
  data: SegmentedBodyData,
  stimulusLevels: Record<string, number>
): void {
  for (const [regionId, meshes] of Object.entries(data.regionMeshes)) {
    for (const mesh of meshes) {
      applyMeshHeatLevel(mesh, regionId, stimulusLevels);
    }
  }

  for (const mesh of data.neutralMeshes) {
    applyMeshHeatLevel(mesh, null, stimulusLevels);
  }
}

/**
 * Interpolates numeric stimulus first. The Gaussian field and continuous color
 * ramp are applied afterward, matching a conventional heat-map pipeline.
 */
export function interpolateStimulusLevels(
  fromLevels: Record<string, number>,
  toLevels: Record<string, number>,
  t: number
): Record<string, number> {
  const clamped = Math.min(1, Math.max(0, t));
  const keys = new Set([...Object.keys(fromLevels), ...Object.keys(toLevels)]);
  const result: Record<string, number> = {};
  for (const key of keys) {
    const from = Number.isFinite(fromLevels[key]) ? fromLevels[key] : 0;
    const to = Number.isFinite(toLevels[key]) ? toLevels[key] : 0;
    result[key] = from + (to - from) * clamped;
  }
  return result;
}
