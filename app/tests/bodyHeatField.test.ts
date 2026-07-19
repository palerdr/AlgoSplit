import * as THREE from 'three';
import {
  BODY_HEAT_BLUR_RADIUS_PX,
  BODY_HEAT_GAUSSIAN_WEIGHTS,
  BODY_HEAT_LEVEL_ATTRIBUTE,
  computeBodyHeatFieldTargetSize,
  createBodyHeatCompositeUniforms,
  injectBodyHeatFieldShader,
  setBodyHeatLevelAttribute,
} from '../src/3d/bodyHeatField';
import {
  buildSegmentedBody,
  interpolateStimulusLevels,
  normalizeRegionObjectName,
  updateSegmentedBodyHeatLevels,
} from '../src/3d/buildBodyMeshes';

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

describe('body scalar heat field', () => {
  it('stores a clamped, dynamic scalar at every rendered vertex', () => {
    const part = triangle('clavicular', [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);

    setBodyHeatLevelAttribute(part.geometry, 1.4);
    const heat = part.geometry.getAttribute(
      BODY_HEAT_LEVEL_ATTRIBUTE
    ) as THREE.BufferAttribute;

    expect(heat.count).toBe(3);
    expect(heat.usage).toBe(THREE.DynamicDrawUsage);
    expect(Array.from(heat.array)).toEqual([1, 1, 1]);

    setBodyHeatLevelAttribute(part.geometry, -0.2);
    expect(Array.from(heat.array)).toEqual([0, 0, 0]);
  });

  it('builds region heat levels without seam or RGB boundary attributes', () => {
    const parts = [
      triangle('clavicular', [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ]),
      triangle('sternocostal.001', [
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ]),
      triangle('neutral_body', [
        [2, 0, 0],
        [3, 0, 0],
        [2, 1, 0],
      ]),
    ];
    const body = buildSegmentedBody(parts, {
      clavicular: 7,
      sternocostal: 3.5,
    });
    const clavicular = body.regionMeshes.clavicular[0];
    const sternocostal = body.regionMeshes.sternocostal[0];
    const neutral = body.neutralMeshes[0];
    const clavicularHeat = clavicular.geometry.getAttribute(
      BODY_HEAT_LEVEL_ATTRIBUTE
    ) as THREE.BufferAttribute;
    const sternocostalHeat = sternocostal.geometry.getAttribute(
      BODY_HEAT_LEVEL_ATTRIBUTE
    ) as THREE.BufferAttribute;
    const neutralHeat = neutral.geometry.getAttribute(
      BODY_HEAT_LEVEL_ATTRIBUTE
    ) as THREE.BufferAttribute;

    expect(Array.from(clavicularHeat.array)).toEqual([1, 1, 1]);
    expect(Array.from(sternocostalHeat.array)).toEqual([0.5, 0.5, 0.5]);
    expect(Array.from(neutralHeat.array)).toEqual([0, 0, 0]);
    expect(clavicular.geometry.hasAttribute('aBoundaryBarycentric')).toBe(false);
    expect(clavicular.geometry.hasAttribute('color')).toBe(false);
    expect((clavicular.material as THREE.Material).customProgramCacheKey()).toContain(
      'scalar-heat-field-v3'
    );
    expect(body.heatUniforms.uBodyHeatRamp.value).toHaveLength(7);
  });

  it('interpolates numeric stimulus during the post-workout handoff', () => {
    const from = { clavicular: 7, sternocostal: 0 };
    const to = { clavicular: 0, anterior_deltoid: 4 };
    const midpoint = interpolateStimulusLevels(from, to, 0.5);

    expect(midpoint).toEqual({
      clavicular: 3.5,
      sternocostal: 0,
      anterior_deltoid: 2,
    });

    const body = buildSegmentedBody(
      [
        triangle('clavicular', [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ]),
      ],
      from
    );
    updateSegmentedBodyHeatLevels(body, midpoint);
    const heat = body.regionMeshes.clavicular[0].geometry.getAttribute(
      BODY_HEAT_LEVEL_ATTRIBUTE
    ) as THREE.BufferAttribute;
    expect(heat.getX(0)).toBeCloseTo(0.5, 7);
  });

  it('keeps duplicate GLB names on the same scalar source', () => {
    expect(normalizeRegionObjectName('posterior_deltoid.001')).toBe(
      'posterior_deltoid'
    );
    expect(normalizeRegionObjectName('triceps_long_head2')).toBe(
      'triceps_long_head'
    );
  });

  it('uses a positive, symmetric, normalized Gaussian kernel', () => {
    const [center, ...sides] = BODY_HEAT_GAUSSIAN_WEIGHTS;
    const total = center + 2 * sides.reduce((sum, weight) => sum + weight, 0);

    expect(BODY_HEAT_BLUR_RADIUS_PX).toBe(18);
    expect(BODY_HEAT_GAUSSIAN_WEIGHTS.every((weight) => weight > 0)).toBe(true);
    expect(total).toBeCloseTo(1, 12);
  });

  it('caps its offscreen field while preserving the drawing-buffer aspect', () => {
    expect(computeBodyHeatFieldTargetSize(1200, 2400)).toEqual({
      width: 384,
      height: 768,
      scale: 0.32,
    });
    expect(computeBodyHeatFieldTargetSize(800, 600)).toEqual({
      width: 400,
      height: 300,
      scale: 0.5,
    });
  });

  it('colorizes the blurred scalar before stock Phong lighting', () => {
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main(){}',
      fragmentShader: '#include <common>\nvoid main(){\n#include <color_fragment>\n}',
    };
    const uniforms = createBodyHeatCompositeUniforms();

    injectBodyHeatFieldShader(shader as never, uniforms);

    expect(shader.fragmentShader).toContain('texture2D( uBodyHeatField');
    expect(shader.fragmentShader).toContain('bodyHeatSample.r / max( bodyHeatSample.g');
    expect(shader.fragmentShader).toContain('sampleBodyHeatRamp');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix');
    expect(shader.fragmentShader).not.toContain('dFdx');
    expect(shader.uniforms).toHaveProperty('uBodyHeatField');
    expect(shader.uniforms).toHaveProperty('uBodyHeatRamp');
    expect(shader.fragmentShader.indexOf('#include <color_fragment>')).toBeLessThan(
      shader.fragmentShader.indexOf('diffuseColor.rgb = mix')
    );
  });
});
