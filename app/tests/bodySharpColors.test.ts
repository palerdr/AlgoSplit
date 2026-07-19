import * as THREE from 'three';
import {
  buildSegmentedBody,
  normalizeRegionObjectName,
  snapshotSegmentedBodyColors,
  updateSegmentedBodyColorTransition,
  updateSegmentedBodyColors,
} from '../src/3d/buildBodyMeshes';
import { getRegionHex, NEUTRAL_HEX } from '../src/3d/regionColors';

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

function expectColor(actual: THREE.Color, expected: string | THREE.Color): void {
  const target = expected instanceof THREE.Color ? expected : new THREE.Color(expected);
  expect(actual.r).toBeCloseTo(target.r, 7);
  expect(actual.g).toBeCloseTo(target.g, 7);
  expect(actual.b).toBeCloseTo(target.b, 7);
}

function materialOf(mesh: THREE.Mesh): THREE.MeshPhongMaterial {
  return mesh.material as THREE.MeshPhongMaterial;
}

describe('sharp body heatmap colors', () => {
  it('renders adjacent regions as distinct solid Phong materials', () => {
    const clavicular = triangle('clavicular', [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const sternocostal = triangle('sternocostal.001', [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ]);
    const neutral = triangle('neutral_body', [
      [2, 0, 0],
      [3, 0, 0],
      [2, 1, 0],
    ]);
    const levels = { clavicular: 7, sternocostal: 2 };
    const body = buildSegmentedBody([clavicular, sternocostal, neutral], levels);
    const clavicularMesh = body.regionMeshes.clavicular[0];
    const sternocostalMesh = body.regionMeshes.sternocostal[0];
    const neutralMesh = body.neutralMeshes[0];
    const clavicularMaterial = materialOf(clavicularMesh);
    const sternocostalMaterial = materialOf(sternocostalMesh);

    expect(clavicularMaterial).not.toBe(sternocostalMaterial);
    expect(clavicularMaterial.vertexColors).toBe(false);
    expect(sternocostalMaterial.vertexColors).toBe(false);
    expectColor(clavicularMaterial.color, getRegionHex('clavicular', levels));
    expectColor(sternocostalMaterial.color, getRegionHex('sternocostal', levels));
    expectColor(materialOf(neutralMesh).color, NEUTRAL_HEX);
    expect(clavicularMaterial.color.equals(sternocostalMaterial.color)).toBe(false);

    for (const mesh of [clavicularMesh, sternocostalMesh, neutralMesh]) {
      const material = materialOf(mesh);
      expect(mesh.geometry.hasAttribute('aBodyHeatLevel')).toBe(false);
      expect(mesh.geometry.hasAttribute('aBoundaryBarycentric')).toBe(false);
      expect(mesh.geometry.hasAttribute('color')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile')).toBe(false);
      expect(material.customProgramCacheKey()).not.toContain('heat-field');
    }
  });

  it('updates existing material colors without replacing materials', () => {
    const body = buildSegmentedBody(
      [
        triangle('clavicular', [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ]),
      ],
      { clavicular: 1 }
    );
    const mesh = body.regionMeshes.clavicular[0];
    const material = materialOf(mesh);

    updateSegmentedBodyColors(body, { clavicular: 6 });

    expect(mesh.material).toBe(material);
    expectColor(material.color, getRegionHex('clavicular', { clavicular: 6 }));
  });

  it('keeps borders sharp while whole-region colors transition over time', () => {
    const fromLevels = { clavicular: 1 };
    const toLevels = { clavicular: 7 };
    const body = buildSegmentedBody(
      [
        triangle('clavicular', [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ]),
      ],
      fromLevels
    );
    const mesh = body.regionMeshes.clavicular[0];
    const material = materialOf(mesh);
    const from = snapshotSegmentedBodyColors(body);
    const expectedMidpoint = new THREE.Color(getRegionHex('clavicular', fromLevels)).lerp(
      new THREE.Color(getRegionHex('clavicular', toLevels)),
      0.5
    );

    updateSegmentedBodyColorTransition(body, from, toLevels, 0.5);

    expectColor(material.color, expectedMidpoint);
    expect(mesh.geometry.hasAttribute('color')).toBe(false);

    const displayedBeforeRetarget = material.color.clone();
    const retargetFrom = snapshotSegmentedBodyColors(body);
    updateSegmentedBodyColorTransition(body, retargetFrom, { clavicular: 0 }, 0);
    expectColor(material.color, displayedBeforeRetarget);

    updateSegmentedBodyColorTransition(body, retargetFrom, { clavicular: 0 }, 2);
    expectColor(material.color, getRegionHex('clavicular', { clavicular: 0 }));
  });

  it('keeps duplicate GLB names on the same sharp color source', () => {
    expect(normalizeRegionObjectName('posterior_deltoid.001')).toBe(
      'posterior_deltoid'
    );
    expect(normalizeRegionObjectName('triceps_long_head2')).toBe(
      'triceps_long_head'
    );
  });
});
