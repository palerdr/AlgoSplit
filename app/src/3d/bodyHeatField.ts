import * as THREE from 'three';
import { HEAT_RAMP } from './regionColors';

/** Scalar stimulus written by every body vertex before the field is blurred. */
export const BODY_HEAT_LEVEL_ATTRIBUTE = 'aBodyHeatLevel';

/** Full drawing-buffer radius. The field itself is rendered at a lower scale. */
export const BODY_HEAT_BLUR_RADIUS_PX = 18;

/**
 * A normalized, discrete Gaussian with sigma=2 and support [-4, 4]. The blur
 * shader scales its texel offsets so this support spans BODY_HEAT_BLUR_RADIUS_PX.
 */
export const BODY_HEAT_GAUSSIAN_WEIGHTS = [
  0.20416368871516755,
  0.18017382291138087,
  0.1238315368057753,
  0.0662822452863612,
  0.027630550638898826,
] as const;

const BODY_HEAT_TARGET_MAX_DIMENSION = 768;
const BODY_HEAT_TARGET_MAX_SCALE = 0.5;
// Field targets are RGBA8 in Expo GL, so keep this soft enough that adjacent
// depth quantization steps do not interrupt the Gaussian on one surface.
const BODY_HEAT_DEPTH_SHARPNESS = 48;
const BODY_HEAT_MATERIAL_CACHE_KEY = 'algosplit-body-scalar-heat-field-v3';

export interface BodyHeatCompositeUniforms {
  uBodyHeatField: { value: THREE.Texture | null };
  uBodyHeatViewportPx: { value: THREE.Vector2 };
  uBodyHeatRamp: { value: THREE.Color[] };
}

export interface BodyHeatFieldTargetSize {
  width: number;
  height: number;
  scale: number;
}

export interface BodyHeatFieldPipeline {
  resize: (drawingBufferWidth: number, drawingBufferHeight: number) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  dispose: () => void;
}

type CompilableShader = Parameters<THREE.Material['onBeforeCompile']>[0];

export function createBodyHeatCompositeUniforms(): BodyHeatCompositeUniforms {
  return {
    uBodyHeatField: { value: null },
    uBodyHeatViewportPx: { value: new THREE.Vector2(1, 1) },
    // Level zero uses the material's untrained base. These seven colors are
    // continuous stops for scalar levels one through seven.
    uBodyHeatRamp: {
      value: HEAT_RAMP.slice(1).map((hex) => new THREE.Color(hex)),
    },
  };
}

/** Adds or resets the dynamic scalar field sampled by the capture pass. */
export function setBodyHeatLevelAttribute(
  geometry: THREE.BufferGeometry,
  normalizedLevel: number
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const clamped = Math.min(1, Math.max(0, normalizedLevel));
  let attribute = geometry.getAttribute(BODY_HEAT_LEVEL_ATTRIBUTE) as
    | THREE.BufferAttribute
    | undefined;

  if (!attribute || attribute.count !== position.count || attribute.itemSize !== 1) {
    attribute = new THREE.Float32BufferAttribute(new Float32Array(position.count), 1);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(BODY_HEAT_LEVEL_ATTRIBUTE, attribute);
  }

  const values = attribute.array as Float32Array;
  values.fill(clamped);
  attribute.needsUpdate = true;
}

/**
 * Injects the blurred scalar field before stock Phong lighting. RGB is never
 * blurred: the fractional scalar is colorized only after the Gaussian pass.
 */
export function injectBodyHeatFieldShader(
  shader: CompilableShader,
  uniforms: BodyHeatCompositeUniforms
): void {
  shader.uniforms.uBodyHeatField = uniforms.uBodyHeatField;
  shader.uniforms.uBodyHeatViewportPx = uniforms.uBodyHeatViewportPx;
  shader.uniforms.uBodyHeatRamp = uniforms.uBodyHeatRamp;

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform sampler2D uBodyHeatField;
uniform vec2 uBodyHeatViewportPx;
uniform vec3 uBodyHeatRamp[ 7 ];

vec3 sampleBodyHeatRamp( float heatLevel ) {
  float level = clamp( heatLevel, 1.0, 7.0 );
  if ( level < 2.0 ) return mix( uBodyHeatRamp[ 0 ], uBodyHeatRamp[ 1 ], level - 1.0 );
  if ( level < 3.0 ) return mix( uBodyHeatRamp[ 1 ], uBodyHeatRamp[ 2 ], level - 2.0 );
  if ( level < 4.0 ) return mix( uBodyHeatRamp[ 2 ], uBodyHeatRamp[ 3 ], level - 3.0 );
  if ( level < 5.0 ) return mix( uBodyHeatRamp[ 3 ], uBodyHeatRamp[ 4 ], level - 4.0 );
  if ( level < 6.0 ) return mix( uBodyHeatRamp[ 4 ], uBodyHeatRamp[ 5 ], level - 5.0 );
  return mix( uBodyHeatRamp[ 5 ], uBodyHeatRamp[ 6 ], level - 6.0 );
}`
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
vec2 bodyHeatUv = gl_FragCoord.xy / max( uBodyHeatViewportPx, vec2( 1.0 ) );
vec4 bodyHeatSample = texture2D( uBodyHeatField, bodyHeatUv );
// Coverage normalization keeps the scalar stable at the silhouette while the
// final body geometry remains the hard clip for the visible heat map.
float bodyHeat = clamp(
  bodyHeatSample.r / max( bodyHeatSample.g, 0.0001 ),
  0.0,
  1.0
);
float bodyHeatLevel = bodyHeat * 7.0;
float bodyHeatPresence = clamp( bodyHeatLevel, 0.0, 1.0 );
bodyHeatPresence = bodyHeatPresence * bodyHeatPresence * ( 3.0 - 2.0 * bodyHeatPresence );
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  sampleBodyHeatRamp( bodyHeatLevel ),
  bodyHeatPresence
);`
    );
}

export function configureBodyHeatFieldMaterial(
  material: THREE.MeshPhongMaterial,
  uniforms: BodyHeatCompositeUniforms
): void {
  material.onBeforeCompile = (shader) => injectBodyHeatFieldShader(shader, uniforms);
  material.customProgramCacheKey = () => BODY_HEAT_MATERIAL_CACHE_KEY;
}

export function computeBodyHeatFieldTargetSize(
  drawingBufferWidth: number,
  drawingBufferHeight: number
): BodyHeatFieldTargetSize {
  const safeWidth = Math.max(1, Math.round(drawingBufferWidth));
  const safeHeight = Math.max(1, Math.round(drawingBufferHeight));
  const scale = Math.min(
    BODY_HEAT_TARGET_MAX_SCALE,
    BODY_HEAT_TARGET_MAX_DIMENSION / Math.max(safeWidth, safeHeight)
  );
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
  };
}

function createFieldTarget(width: number, height: number, depthBuffer: boolean) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.generateMipmaps = false;
  return target;
}

function createHeatCaptureMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: `
precision highp float;
attribute float ${BODY_HEAT_LEVEL_ATTRIBUTE};
varying float vBodyHeatLevel;
void main() {
  vBodyHeatLevel = ${BODY_HEAT_LEVEL_ATTRIBUTE};
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
    fragmentShader: `
precision highp float;
varying float vBodyHeatLevel;
void main() {
  // R = scalar stimulus, G = sharp body coverage, B = visible surface depth.
  gl_FragColor = vec4( vBodyHeatLevel, 1.0, gl_FragCoord.z, 1.0 );
}`,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    blending: THREE.NoBlending,
  });
  material.toneMapped = false;
  return material;
}

function createHeatBlurMaterial(): THREE.ShaderMaterial {
  const [w0, w1, w2, w3, w4] = BODY_HEAT_GAUSSIAN_WEIGHTS;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uInputField: { value: null as THREE.Texture | null },
      uBlurDirection: { value: new THREE.Vector2() },
    },
    vertexShader: `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}`,
    fragmentShader: `
precision highp float;
uniform sampler2D uInputField;
uniform vec2 uBlurDirection;
varying vec2 vUv;

float bodyHeatDepthWeight( float sampleDepth, float centerDepth ) {
  return exp( -abs( sampleDepth - centerDepth ) * ${BODY_HEAT_DEPTH_SHARPNESS.toFixed(1)} );
}

void main() {
  vec4 centerSample = texture2D( uInputField, vUv );
  vec2 accumulatedField = centerSample.rg * ${w0.toFixed(12)};
  float accumulatedWeight = ${w0.toFixed(12)};

  vec4 positive1 = texture2D( uInputField, vUv + uBlurDirection );
  vec4 negative1 = texture2D( uInputField, vUv - uBlurDirection );
  float positiveWeight1 = ${w1.toFixed(12)} * bodyHeatDepthWeight( positive1.b, centerSample.b );
  float negativeWeight1 = ${w1.toFixed(12)} * bodyHeatDepthWeight( negative1.b, centerSample.b );
  accumulatedField += positive1.rg * positiveWeight1 + negative1.rg * negativeWeight1;
  accumulatedWeight += positiveWeight1 + negativeWeight1;

  vec4 positive2 = texture2D( uInputField, vUv + uBlurDirection * 2.0 );
  vec4 negative2 = texture2D( uInputField, vUv - uBlurDirection * 2.0 );
  float positiveWeight2 = ${w2.toFixed(12)} * bodyHeatDepthWeight( positive2.b, centerSample.b );
  float negativeWeight2 = ${w2.toFixed(12)} * bodyHeatDepthWeight( negative2.b, centerSample.b );
  accumulatedField += positive2.rg * positiveWeight2 + negative2.rg * negativeWeight2;
  accumulatedWeight += positiveWeight2 + negativeWeight2;

  vec4 positive3 = texture2D( uInputField, vUv + uBlurDirection * 3.0 );
  vec4 negative3 = texture2D( uInputField, vUv - uBlurDirection * 3.0 );
  float positiveWeight3 = ${w3.toFixed(12)} * bodyHeatDepthWeight( positive3.b, centerSample.b );
  float negativeWeight3 = ${w3.toFixed(12)} * bodyHeatDepthWeight( negative3.b, centerSample.b );
  accumulatedField += positive3.rg * positiveWeight3 + negative3.rg * negativeWeight3;
  accumulatedWeight += positiveWeight3 + negativeWeight3;

  vec4 positive4 = texture2D( uInputField, vUv + uBlurDirection * 4.0 );
  vec4 negative4 = texture2D( uInputField, vUv - uBlurDirection * 4.0 );
  float positiveWeight4 = ${w4.toFixed(12)} * bodyHeatDepthWeight( positive4.b, centerSample.b );
  float negativeWeight4 = ${w4.toFixed(12)} * bodyHeatDepthWeight( negative4.b, centerSample.b );
  accumulatedField += positive4.rg * positiveWeight4 + negative4.rg * negativeWeight4;
  accumulatedWeight += positiveWeight4 + negativeWeight4;

  gl_FragColor = vec4(
    accumulatedField / max( accumulatedWeight, 0.00001 ),
    centerSample.b,
    1.0
  );
}`,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  material.toneMapped = false;
  return material;
}

/**
 * Builds the real-heatmap render path:
 * scalar capture -> horizontal Gaussian -> vertical Gaussian -> palette/Phong.
 */
export function createBodyHeatFieldPipeline(
  renderer: THREE.WebGLRenderer,
  uniforms: BodyHeatCompositeUniforms,
  drawingBufferWidth: number,
  drawingBufferHeight: number
): BodyHeatFieldPipeline {
  let targetSize = computeBodyHeatFieldTargetSize(
    drawingBufferWidth,
    drawingBufferHeight
  );
  const rawTarget = createFieldTarget(targetSize.width, targetSize.height, true);
  const pingTarget = createFieldTarget(targetSize.width, targetSize.height, false);
  const fieldTarget = createFieldTarget(targetSize.width, targetSize.height, false);
  const captureMaterial = createHeatCaptureMaterial();
  const blurMaterial = createHeatBlurMaterial();
  const blurScene = new THREE.Scene();
  const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blurGeometry = new THREE.PlaneGeometry(2, 2);
  const blurQuad = new THREE.Mesh(blurGeometry, blurMaterial);
  blurQuad.frustumCulled = false;
  blurScene.add(blurQuad);
  const previousClearColor = new THREE.Color();

  const resize = (nextWidth: number, nextHeight: number) => {
    const nextSize = computeBodyHeatFieldTargetSize(nextWidth, nextHeight);
    uniforms.uBodyHeatViewportPx.value.set(
      Math.max(1, Math.round(nextWidth)),
      Math.max(1, Math.round(nextHeight))
    );
    if (nextSize.width === targetSize.width && nextSize.height === targetSize.height) {
      targetSize = nextSize;
      return;
    }
    targetSize = nextSize;
    rawTarget.setSize(nextSize.width, nextSize.height);
    pingTarget.setSize(nextSize.width, nextSize.height);
    fieldTarget.setSize(nextSize.width, nextSize.height);
  };

  resize(drawingBufferWidth, drawingBufferHeight);
  uniforms.uBodyHeatField.value = fieldTarget.texture;

  return {
    resize,
    render: (scene, camera) => {
      const previousTarget = renderer.getRenderTarget();
      const previousOverrideMaterial = scene.overrideMaterial;
      renderer.getClearColor(previousClearColor);
      const previousClearAlpha = renderer.getClearAlpha();
      const blurStep = (BODY_HEAT_BLUR_RADIUS_PX * targetSize.scale) / 4;

      try {
        renderer.setClearColor(0x000000, 0);
        scene.overrideMaterial = captureMaterial;
        renderer.setRenderTarget(rawTarget);
        renderer.clear(true, true, true);
        renderer.render(scene, camera);
        scene.overrideMaterial = previousOverrideMaterial;

        blurMaterial.uniforms.uInputField.value = rawTarget.texture;
        blurMaterial.uniforms.uBlurDirection.value.set(
          blurStep / targetSize.width,
          0
        );
        renderer.setRenderTarget(pingTarget);
        renderer.clear(true, true, true);
        renderer.render(blurScene, blurCamera);

        blurMaterial.uniforms.uInputField.value = pingTarget.texture;
        blurMaterial.uniforms.uBlurDirection.value.set(
          0,
          blurStep / targetSize.height
        );
        renderer.setRenderTarget(fieldTarget);
        renderer.clear(true, true, true);
        renderer.render(blurScene, blurCamera);

        uniforms.uBodyHeatField.value = fieldTarget.texture;
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(previousClearColor, previousClearAlpha);
        renderer.clear(true, true, true);
        renderer.render(scene, camera);
      } finally {
        scene.overrideMaterial = previousOverrideMaterial;
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(previousClearColor, previousClearAlpha);
      }
    },
    dispose: () => {
      uniforms.uBodyHeatField.value = null;
      rawTarget.dispose();
      pingTarget.dispose();
      fieldTarget.dispose();
      captureMaterial.dispose();
      blurMaterial.dispose();
      blurGeometry.dispose();
    },
  };
}
