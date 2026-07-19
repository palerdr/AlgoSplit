import * as THREE from 'three';
import { getRegionHex, NEUTRAL_HEX, VISIBLE_REGION_IDS } from './regionColors';
import {
  NEUTRAL_BODY_REGION_KEY,
  attachBoundaryFeatherAttributes,
  computeBodyPartBoundaryData,
  configureBoundaryFeatherMaterial,
  updateBoundaryFeatherColors,
  type BodyPartBoundaryData,
  type BoundaryColorResolver,
} from './bodyBoundaryFeather';

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
  const material = new THREE.MeshPhongMaterial({
    ...BODY_MATERIAL_BASE,
    color: new THREE.Color(NEUTRAL_HEX),
    vertexColors: true,
    transparent: false,
    opacity: 1,
  });
  configureBoundaryFeatherMaterial(material);
  return material;
}

function applyMeshColor(
  mesh: THREE.Mesh,
  boundaryData: BodyPartBoundaryData,
  resolveColor: BoundaryColorResolver
): void {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const color = resolveColor(boundaryData.regionKey);
  let colorAttribute = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;

  if (!colorAttribute || colorAttribute.count !== position.count) {
    colorAttribute = new THREE.Float32BufferAttribute(
      new Float32Array(position.count * 3),
      3
    );
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('color', colorAttribute);
  }

  for (let i = 0; i < position.count; i++) {
    colorAttribute.setXYZ(i, color.r, color.g, color.b);
  }

  colorAttribute.needsUpdate = true;
  updateBoundaryFeatherColors(geometry, boundaryData, resolveColor);
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
  const renderParts = parts.map((part) => ({
    name: part.name,
    geometry: part.geometry.index ? part.geometry.toNonIndexed() : part.geometry,
  }));
  const boundaryDataByPart = computeBodyPartBoundaryData(renderParts, (part) => {
    const regionId = normalizeRegionObjectName(part.name);
    return VISIBLE_REGION_ID_SET.has(regionId) ? regionId : NEUTRAL_BODY_REGION_KEY;
  });
  const resolveColor = createStimulusColorResolver(stimulusLevels);

  for (let partIndex = 0; partIndex < renderParts.length; partIndex++) {
    const part = renderParts[partIndex];
    const boundaryData = boundaryDataByPart[partIndex];
    const regionId = normalizeRegionObjectName(part.name);
    const isRegion = VISIBLE_REGION_ID_SET.has(regionId);
    const material = createBodyMaterial();

    attachBoundaryFeatherAttributes(part.geometry);
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.name = part.name;
    mesh.frustumCulled = false;
    mesh.userData.regionId = isRegion ? regionId : null;
    mesh.userData.boundaryData = boundaryData;
    applyMeshColor(mesh, boundaryData, resolveColor);

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
  const resolveColor = createStimulusColorResolver(stimulusLevels);
  for (const meshes of Object.values(data.regionMeshes)) {
    for (const mesh of meshes) {
      applyMeshColor(
        mesh,
        mesh.userData.boundaryData as BodyPartBoundaryData,
        resolveColor
      );
    }
  }

  for (const mesh of data.neutralMeshes) {
    applyMeshColor(
      mesh,
      mesh.userData.boundaryData as BodyPartBoundaryData,
      resolveColor
    );
  }
}

function createStimulusColorResolver(
  stimulusLevels: Record<string, number>
): BoundaryColorResolver {
  const cache = new Map<string, THREE.Color>();
  return (regionKey) => {
    const cached = cache.get(regionKey);
    if (cached) return cached;
    const color = new THREE.Color(
      regionKey === NEUTRAL_BODY_REGION_KEY
        ? NEUTRAL_HEX
        : getRegionHex(regionKey, stimulusLevels)
    );
    cache.set(regionKey, color);
    return color;
  };
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
  const cache = new Map<string, THREE.Color>();
  const resolveColor: BoundaryColorResolver = (regionKey) => {
    const cached = cache.get(regionKey);
    if (cached) return cached;
    const color = new THREE.Color(
      regionKey === NEUTRAL_BODY_REGION_KEY
        ? NEUTRAL_HEX
        : lerpHex(
            getRegionHex(regionKey, fromLevels),
            getRegionHex(regionKey, toLevels),
            clamped
          )
    );
    cache.set(regionKey, color);
    return color;
  };

  for (const meshes of Object.values(data.regionMeshes)) {
    for (const mesh of meshes) {
      applyMeshColor(
        mesh,
        mesh.userData.boundaryData as BodyPartBoundaryData,
        resolveColor
      );
    }
  }

  // The neutral body's own color is static, but its shared edge colors must
  // follow trained neighbors throughout the temporal crossfade.
  for (const mesh of data.neutralMeshes) {
    applyMeshColor(
      mesh,
      mesh.userData.boundaryData as BodyPartBoundaryData,
      resolveColor
    );
  }
}
