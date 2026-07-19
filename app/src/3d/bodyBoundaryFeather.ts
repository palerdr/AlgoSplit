import * as THREE from 'three';

/** Internal key used for the decorative body surface around muscle regions. */
export const NEUTRAL_BODY_REGION_KEY = '__neutral_body__';

/** A restrained, screen-space feather that stays narrow at every zoom level. */
export const BODY_BOUNDARY_FEATHER_PX = 4.5;

const POSITION_KEY_SCALE = 100_000;
const SHADER_CACHE_KEY = 'algosplit-body-boundary-feather-v1';

const BARYCENTRIC_ATTRIBUTE = 'aBoundaryBarycentric';
const EDGE_COLOR_ATTRIBUTES = [
  'aBoundaryColor0',
  'aBoundaryColor1',
  'aBoundaryColor2',
] as const;

export interface BoundaryBodyPart {
  name: string;
  geometry: THREE.BufferGeometry;
}

/**
 * One entry per triangle edge, ordered by the vertex opposite that edge:
 * 0 = edge v1-v2, 1 = edge v2-v0, 2 = edge v0-v1.
 */
export interface BodyPartBoundaryData {
  regionKey: string;
  edgeNeighborKeys: Array<string | null>;
}

interface EdgeOwner {
  partIndex: number;
  triangleEdgeIndex: number;
  regionKey: string;
}

type RegionKeyForPart = (part: BoundaryBodyPart) => string;
export type BoundaryColorResolver = (regionKey: string) => THREE.Color;

function pointKey(position: THREE.BufferAttribute, index: number): string {
  const x = Math.round(position.getX(index) * POSITION_KEY_SCALE);
  const y = Math.round(position.getY(index) * POSITION_KEY_SCALE);
  const z = Math.round(position.getZ(index) * POSITION_KEY_SCALE);
  return `${x},${y},${z}`;
}

function geometricEdgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function triangleEdgeVertexIndices(
  triangleStart: number,
  oppositeVertex: number
): readonly [number, number] {
  switch (oppositeVertex) {
    case 0:
      return [triangleStart + 1, triangleStart + 2];
    case 1:
      return [triangleStart + 2, triangleStart];
    default:
      return [triangleStart, triangleStart + 1];
  }
}

/**
 * Finds anatomical seams by matching geometric boundary edges between body
 * parts. Internal triangle diagonals occur twice inside one part and are
 * intentionally excluded, as are unmatched silhouette edges.
 */
export function computeBodyPartBoundaryData(
  parts: BoundaryBodyPart[],
  getRegionKey: RegionKeyForPart
): BodyPartBoundaryData[] {
  const result = parts.map((part) => {
    const position = part.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (part.geometry.index) {
      throw new Error('Body boundary feathering requires non-indexed geometry');
    }
    if (position.count % 3 !== 0) {
      throw new Error(`Body part ${part.name} does not contain complete triangles`);
    }
    return {
      regionKey: getRegionKey(part),
      edgeNeighborKeys: Array<string | null>(position.count).fill(null),
    };
  });

  const globalBoundaryEdges = new Map<string, EdgeOwner[]>();

  parts.forEach((part, partIndex) => {
    const position = part.geometry.getAttribute('position') as THREE.BufferAttribute;
    const localEdges = new Map<string, EdgeOwner[]>();
    const regionKey = result[partIndex].regionKey;

    for (let triangleStart = 0; triangleStart < position.count; triangleStart += 3) {
      for (let oppositeVertex = 0; oppositeVertex < 3; oppositeVertex++) {
        const [aIndex, bIndex] = triangleEdgeVertexIndices(triangleStart, oppositeVertex);
        const key = geometricEdgeKey(
          pointKey(position, aIndex),
          pointKey(position, bIndex)
        );
        const owner: EdgeOwner = {
          partIndex,
          triangleEdgeIndex: triangleStart + oppositeVertex,
          regionKey,
        };
        const owners = localEdges.get(key);
        if (owners) owners.push(owner);
        else localEdges.set(key, [owner]);
      }
    }

    for (const [key, owners] of localEdges) {
      // A single owner means this is a part boundary. Two owners are merely
      // the diagonal shared by adjacent triangles inside the same region.
      if (owners.length !== 1) continue;
      const globalOwners = globalBoundaryEdges.get(key);
      if (globalOwners) globalOwners.push(owners[0]);
      else globalBoundaryEdges.set(key, [owners[0]]);
    }
  });

  for (const owners of globalBoundaryEdges.values()) {
    for (const owner of owners) {
      const neighborKeys = Array.from(
        new Set(
          owners
            .filter(
              (candidate) =>
                candidate.partIndex !== owner.partIndex &&
                candidate.regionKey !== owner.regionKey
            )
            .map((candidate) => candidate.regionKey)
        )
      );

      // Ambiguous multi-owner edges are safer left crisp. The current asset's
      // shared edges all have exactly two owners, but this protects re-exports.
      if (neighborKeys.length === 1) {
        result[owner.partIndex].edgeNeighborKeys[owner.triangleEdgeIndex] =
          neighborKeys[0];
      }
    }
  }

  return result;
}

function createDynamicAttribute(length: number, itemSize: number): THREE.BufferAttribute {
  const attribute = new THREE.Float32BufferAttribute(new Float32Array(length), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

/** Adds the static edge-distance coordinates and dynamic shared edge colors. */
export function attachBoundaryFeatherAttributes(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const barycentric = new Float32Array(position.count * 3);

  for (let triangleStart = 0; triangleStart < position.count; triangleStart += 3) {
    barycentric[(triangleStart + 0) * 3 + 0] = 1;
    barycentric[(triangleStart + 1) * 3 + 1] = 1;
    barycentric[(triangleStart + 2) * 3 + 2] = 1;
  }

  geometry.setAttribute(
    BARYCENTRIC_ATTRIBUTE,
    new THREE.Float32BufferAttribute(barycentric, 3)
  );
  for (const attributeName of EDGE_COLOR_ATTRIBUTES) {
    geometry.setAttribute(
      attributeName,
      createDynamicAttribute(position.count * 4, 4)
    );
  }
}

/**
 * Updates the common color on both sides of every paired anatomical seam.
 * Colors are already in Three's linear working space, so the midpoint avoids
 * the muddy edge produced by averaging encoded hexadecimal channels.
 */
export function updateBoundaryFeatherColors(
  geometry: THREE.BufferGeometry,
  boundaryData: BodyPartBoundaryData,
  resolveColor: BoundaryColorResolver
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const ownColor = resolveColor(boundaryData.regionKey);
  const edgeAttributes = EDGE_COLOR_ATTRIBUTES.map(
    (name) => geometry.getAttribute(name) as THREE.BufferAttribute
  );

  for (let triangleStart = 0; triangleStart < position.count; triangleStart += 3) {
    for (let oppositeVertex = 0; oppositeVertex < 3; oppositeVertex++) {
      const neighborKey =
        boundaryData.edgeNeighborKeys[triangleStart + oppositeVertex];
      const attribute = edgeAttributes[oppositeVertex];

      let r = 0;
      let g = 0;
      let b = 0;
      let enabled = 0;
      if (neighborKey) {
        const sharedColor = ownColor.clone().lerp(resolveColor(neighborKey), 0.5);
        r = sharedColor.r;
        g = sharedColor.g;
        b = sharedColor.b;
        enabled = 1;
      }

      // Metadata is constant across a triangle, so interpolation preserves the
      // same target color while barycentrics measure distance to its edge.
      for (let localVertex = 0; localVertex < 3; localVertex++) {
        const vertexIndex = triangleStart + localVertex;
        attribute.setXYZW(vertexIndex, r, g, b, enabled);
      }
    }
  }

  for (const attribute of edgeAttributes) attribute.needsUpdate = true;
}

type CompilableShader = Parameters<THREE.Material['onBeforeCompile']>[0];

/** Exported separately so shader composition can be covered without a GL context. */
export function injectBoundaryFeatherShader(shader: CompilableShader): void {
  shader.uniforms.uBoundaryFeatherPx = { value: BODY_BOUNDARY_FEATHER_PX };

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute vec3 ${BARYCENTRIC_ATTRIBUTE};
attribute vec4 ${EDGE_COLOR_ATTRIBUTES[0]};
attribute vec4 ${EDGE_COLOR_ATTRIBUTES[1]};
attribute vec4 ${EDGE_COLOR_ATTRIBUTES[2]};
varying vec3 vBoundaryBarycentric;
varying vec4 vBoundaryColor0;
varying vec4 vBoundaryColor1;
varying vec4 vBoundaryColor2;`
    )
    .replace(
      '#include <color_vertex>',
      `#include <color_vertex>
vBoundaryBarycentric = ${BARYCENTRIC_ATTRIBUTE};
vBoundaryColor0 = ${EDGE_COLOR_ATTRIBUTES[0]};
vBoundaryColor1 = ${EDGE_COLOR_ATTRIBUTES[1]};
vBoundaryColor2 = ${EDGE_COLOR_ATTRIBUTES[2]};`
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform float uBoundaryFeatherPx;
varying vec3 vBoundaryBarycentric;
varying vec4 vBoundaryColor0;
varying vec4 vBoundaryColor1;
varying vec4 vBoundaryColor2;`
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
vec3 boundaryDerivativeX = dFdx( vBoundaryBarycentric );
vec3 boundaryDerivativeY = dFdy( vBoundaryBarycentric );
vec3 boundaryDerivative = max(
  sqrt( boundaryDerivativeX * boundaryDerivativeX + boundaryDerivativeY * boundaryDerivativeY ),
  vec3( 0.00001 )
);
vec3 boundaryDistancePx = vBoundaryBarycentric / boundaryDerivative;
float boundaryWeight0 = vBoundaryColor0.a * ( 1.0 - smoothstep( 0.0, uBoundaryFeatherPx, boundaryDistancePx.x ) );
float boundaryWeight1 = vBoundaryColor1.a * ( 1.0 - smoothstep( 0.0, uBoundaryFeatherPx, boundaryDistancePx.y ) );
float boundaryWeight2 = vBoundaryColor2.a * ( 1.0 - smoothstep( 0.0, uBoundaryFeatherPx, boundaryDistancePx.z ) );
float boundaryWeightTotal = boundaryWeight0 + boundaryWeight1 + boundaryWeight2;
if ( boundaryWeightTotal > 0.00001 ) {
  vec3 boundaryTarget = (
    vBoundaryColor0.rgb * boundaryWeight0 +
    vBoundaryColor1.rgb * boundaryWeight1 +
    vBoundaryColor2.rgb * boundaryWeight2
  ) / boundaryWeightTotal;
  float boundaryStrength = max( boundaryWeight0, max( boundaryWeight1, boundaryWeight2 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuse * boundaryTarget, boundaryStrength );
}`
    );
}

/** Keeps the stock Phong lighting while replacing only the anatomical albedo seam. */
export function configureBoundaryFeatherMaterial(
  material: THREE.MeshPhongMaterial
): void {
  material.onBeforeCompile = (shader) => injectBoundaryFeatherShader(shader);
  material.customProgramCacheKey = () => SHADER_CACHE_KEY;
}
