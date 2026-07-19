import * as THREE from 'three';
import {
  attachBoundaryFeatherAttributes,
  computeBodyPartBoundaryData,
  injectBoundaryFeatherShader,
  updateBoundaryFeatherColors,
} from '../src/3d/bodyBoundaryFeather';
import { buildSegmentedBody } from '../src/3d/buildBodyMeshes';
import { getRegionHex } from '../src/3d/regionColors';

function triangle(
  name: string,
  points: Array<readonly [number, number, number]>
): { name: string; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points.flat(), 3)
  );
  return { name, geometry };
}

describe('body boundary feathering', () => {
  it('pairs only the exact anatomical edge shared by different regions', () => {
    const parts = [
      triangle('region_a', [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ]),
      triangle('region_b', [
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ]),
    ];

    const data = computeBodyPartBoundaryData(parts, (part) => part.name);

    // In A the shared v1-v2 edge is opposite v0. In B the shared v2-v0
    // edge is opposite v1. Every unmatched silhouette edge stays disabled.
    expect(data[0].edgeNeighborKeys).toEqual(['region_b', null, null]);
    expect(data[1].edgeNeighborKeys).toEqual([null, 'region_a', null]);
  });

  it('does not feather internal diagonals or duplicate objects from one region', () => {
    const square = {
      name: 'biceps_brachii',
      geometry: new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            0, 0, 0, 1, 0, 0, 0, 1, 0,
            1, 0, 0, 1, 1, 0, 0, 1, 0,
          ],
          3
        )
      ),
    };
    const duplicate = triangle('biceps_brachii.001', [
      [1, 0, 0],
      [2, 0, 0],
      [1, 1, 0],
    ]);

    const data = computeBodyPartBoundaryData(
      [square, duplicate],
      (part) => part.name.replace(/\.\d+$/, '')
    );

    expect(data[0].edgeNeighborKeys.every((neighbor) => neighbor === null)).toBe(true);
    expect(data[1].edgeNeighborKeys.every((neighbor) => neighbor === null)).toBe(true);
  });

  it('stores one shared linear-light color across both sides of a seam', () => {
    const part = triangle('region_a', [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const boundaryData = {
      regionKey: 'region_a',
      edgeNeighborKeys: ['region_b', null, null],
    };
    const colors: Record<string, THREE.Color> = {
      region_a: new THREE.Color('#0A5E27'),
      region_b: new THREE.Color('#f1ece4'),
    };

    attachBoundaryFeatherAttributes(part.geometry);
    updateBoundaryFeatherColors(
      part.geometry,
      boundaryData,
      (regionKey) => colors[regionKey]
    );

    const barycentric = part.geometry.getAttribute(
      'aBoundaryBarycentric'
    ) as THREE.BufferAttribute;
    expect(barycentric.getX(0)).toBe(1);
    expect(barycentric.getY(1)).toBe(1);
    expect(barycentric.getZ(2)).toBe(1);

    const expected = colors.region_a.clone().lerp(colors.region_b, 0.5);
    const sharedEdge = part.geometry.getAttribute(
      'aBoundaryColor0'
    ) as THREE.BufferAttribute;
    for (let vertex = 0; vertex < 3; vertex++) {
      expect(sharedEdge.getX(vertex)).toBeCloseTo(expected.r, 6);
      expect(sharedEdge.getY(vertex)).toBeCloseTo(expected.g, 6);
      expect(sharedEdge.getZ(vertex)).toBeCloseTo(expected.b, 6);
      expect(sharedEdge.getW(vertex)).toBe(1);
    }

    const silhouette = part.geometry.getAttribute(
      'aBoundaryColor1'
    ) as THREE.BufferAttribute;
    expect(silhouette.getW(0)).toBe(0);
  });

  it('integrates trained-to-untrained seam colors into segmented body meshes', () => {
    const parts = [
      triangle('clavicular', [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ]),
      triangle('sternocostal', [
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ]),
    ];
    const levels = { clavicular: 7, sternocostal: 0 };
    const body = buildSegmentedBody(parts, levels);
    const clavicular = body.regionMeshes.clavicular[0];
    const sternocostal = body.regionMeshes.sternocostal[0];
    const seam = clavicular.geometry.getAttribute(
      'aBoundaryColor0'
    ) as THREE.BufferAttribute;
    const oppositeSeam = sternocostal.geometry.getAttribute(
      'aBoundaryColor1'
    ) as THREE.BufferAttribute;
    const expected = new THREE.Color(getRegionHex('clavicular', levels)).lerp(
      new THREE.Color(getRegionHex('sternocostal', levels)),
      0.5
    );

    expect(seam.getX(0)).toBeCloseTo(expected.r, 6);
    expect(seam.getY(0)).toBeCloseTo(expected.g, 6);
    expect(seam.getZ(0)).toBeCloseTo(expected.b, 6);
    expect(seam.getW(0)).toBe(1);
    expect(oppositeSeam.getX(0)).toBeCloseTo(seam.getX(0), 7);
    expect(oppositeSeam.getY(0)).toBeCloseTo(seam.getY(0), 7);
    expect(oppositeSeam.getZ(0)).toBeCloseTo(seam.getZ(0), 7);
    expect(oppositeSeam.getW(0)).toBe(1);
    expect((clavicular.material as THREE.Material).customProgramCacheKey()).toContain(
      'boundary-feather'
    );
  });

  it('injects pixel-width edge blending before stock Phong lighting', () => {
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main(){\n#include <color_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main(){\n#include <color_fragment>\n}',
    };

    injectBoundaryFeatherShader(shader as never);

    expect(shader.vertexShader).toContain('aBoundaryBarycentric');
    expect(shader.fragmentShader).toContain('dFdx( vBoundaryBarycentric )');
    expect(shader.fragmentShader).toContain('dFdy( vBoundaryBarycentric )');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix');
    expect(shader.uniforms).toHaveProperty('uBoundaryFeatherPx');
  });
});
