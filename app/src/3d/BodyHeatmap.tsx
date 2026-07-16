import './glPolyfills';
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, PanResponder, Text, Platform, ActivityIndicator } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Asset } from 'expo-asset';
import {
  buildSegmentedBody,
  type BodyPartGeometry,
  type SegmentedBodyData,
  updateSegmentedBodyColors,
  updateSegmentedBodyColorsBlended,
} from './buildBodyMeshes';
import { BODY_3D_CONFIG } from './threeConfig';

interface BodyHeatmapProps {
  width: number;
  height: number;
  stimulusLevels: Record<string, number>;
  onRegionPress?: (regionId: string) => void;
  /**
   * Bump this number to trigger a celebratory spin: one smooth eased 360°
   * that always lands facing front.
   */
  spinTrigger?: number;
}

const SPIN_DURATION_MS = 1700;
const COLOR_TWEEN_MS = 650;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Minimal Expo GL adapter for three.js (avoids the unmaintained expo-three).
 */
function createRenderer(gl: ExpoWebGLRenderingContext): THREE.WebGLRenderer {
  const canvas = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    clientHeight: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLCanvasElement;

  return new THREE.WebGLRenderer({
    canvas,
    context: gl as unknown as WebGLRenderingContext,
  });
}

// Parsed body-part geometries are cached at module level so remounts skip the
// expensive download + parse. Raw meshes are cached and cloned per mount.
let _cachedRawParts: BodyPartGeometry[] | null = null;
let _cachePromise: Promise<BodyPartGeometry[]> | null = null;

async function loadBinaryAssetBuffer(moduleId: number): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();

  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    return response.arrayBuffer();
  }

  const { readAsStringAsync } = require('expo-file-system/legacy');
  const base64 = await readAsStringAsync(asset.localUri!, { encoding: 'base64' });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

interface LoadedGLTF {
  scene: THREE.Group;
}

function extractBodyPartGeometries(gltf: LoadedGLTF): BodyPartGeometry[] {
  gltf.scene.updateMatrixWorld(true);

  const parts: BodyPartGeometry[] = [];
  gltf.scene.traverse((obj: THREE.Object3D) => {
    const maybeMesh = obj as THREE.Mesh & { isMesh?: boolean };
    if (!maybeMesh.isMesh) return;

    const geometry = maybeMesh.geometry.clone();
    geometry.applyMatrix4(maybeMesh.matrixWorld.clone());

    parts.push({
      name: maybeMesh.name,
      geometry: geometry.index ? geometry.toNonIndexed() : geometry,
    });
  });

  if (parts.length === 0) {
    throw new Error('GLB body model did not contain any meshes');
  }

  return parts;
}

async function loadBodyPartsRaw(): Promise<BodyPartGeometry[]> {
  const arrayBuffer = await loadBinaryAssetBuffer(
    require('../../assets/models/segmented_body.glb')
  );

  const loader = new GLTFLoader();
  const gltf = await new Promise<LoadedGLTF>((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });

  return extractBodyPartGeometries(gltf);
}

async function loadBodyParts(): Promise<BodyPartGeometry[]> {
  if (_cachedRawParts) {
    return _cachedRawParts.map((part) => ({
      name: part.name,
      geometry: part.geometry.clone(),
    }));
  }

  if (!_cachePromise) {
    _cachePromise = loadBodyPartsRaw()
      .then((parts) => {
        _cachedRawParts = parts;
        return parts;
      })
      .catch((err: unknown) => {
        _cachePromise = null;
        throw err;
      }) as Promise<BodyPartGeometry[]>;
  }

  const raw = await _cachePromise;
  return raw.map((part) => ({
    name: part.name,
    geometry: part.geometry.clone(),
  }));
}

function transformBodyParts(parts: BodyPartGeometry[]): BodyPartGeometry[] {
  const totalBounds = new THREE.Box3();
  let hasBounds = false;

  for (const part of parts) {
    part.geometry.computeBoundingBox();
    if (!part.geometry.boundingBox) continue;
    if (!hasBounds) {
      totalBounds.copy(part.geometry.boundingBox);
      hasBounds = true;
    } else {
      totalBounds.union(part.geometry.boundingBox);
    }
  }

  if (!hasBounds) {
    throw new Error('Segmented body model did not produce valid bounds');
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  totalBounds.getSize(size);
  totalBounds.getCenter(center);
  const scale = BODY_3D_CONFIG.model.maxDimension / Math.max(size.x, size.y, size.z);

  for (const part of parts) {
    part.geometry.translate(-center.x, -center.y, -center.z);
    part.geometry.scale(scale, scale, scale);
    part.geometry.deleteAttribute('normal');
    part.geometry.computeVertexNormals();
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();

    const positionAttribute = part.geometry.getAttribute('position') as THREE.BufferAttribute;
    positionAttribute.needsUpdate = true;
  }

  return parts;
}

function BodyHeatmap({ width, height, stimulusLevels, onRegionPress, spinTrigger }: BodyHeatmapProps) {
  const [glError, setGlError] = useState(false);
  // Guards against the async GLB load resolving after unmount — without it
  // the rAF loop would start against a dead GL context and run forever.
  const aliveRef = useRef(true);
  const spinStateRef = useRef<{ startTime: number; from: number; delta: number } | null>(null);
  const spinPendingRef = useRef(false);
  const lastSpinTriggerRef = useRef(0);
  const sceneReadyRef = useRef(false);
  // Crossfade between stimulus states instead of snapping colors.
  const colorTweenRef = useRef<{
    startTime: number;
    from: Record<string, number>;
    to: Record<string, number>;
  } | null>(null);
  const displayedLevelsRef = useRef<Record<string, number>>(stimulusLevels);
  const [isInitializing, setIsInitializing] = useState(true);
  const HORIZONTAL_DRAG_THRESHOLD = BODY_3D_CONFIG.interaction.horizontalDragThreshold;
  const TAP_THRESHOLD = BODY_3D_CONFIG.interaction.tapThreshold;
  const DRAG_SENSITIVITY = BODY_3D_CONFIG.interaction.dragSensitivity;
  const INERTIA_DECAY = BODY_3D_CONFIG.interaction.inertiaDecay;
  const MAX_RELEASE_VELOCITY = BODY_3D_CONFIG.interaction.maxReleaseVelocity;
  const MIN_INERTIA_VELOCITY = BODY_3D_CONFIG.interaction.minInertiaVelocity;
  const TWO_PI = Math.PI * 2;

  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const isDraggingRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchMovedRef = useRef(false);

  const groupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const bodyDataRef = useRef<SegmentedBodyData | null>(null);
  const rafRef = useRef<number | null>(null);
  // Skip renderer.render() when nothing visible changed so an idle body
  // doesn't repaint at 60fps.
  const needsRenderRef = useRef(true);

  const stimulusRef = useRef(stimulusLevels);
  stimulusRef.current = stimulusLevels;

  const normalizeRotation = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return 0;
      const normalized = value % TWO_PI;
      return normalized < 0 ? normalized + TWO_PI : normalized;
    },
    [TWO_PI]
  );

  const pickRegion = useCallback(
    (touchX: number, touchY: number) => {
      if (
        !Number.isFinite(touchX) ||
        !Number.isFinite(touchY) ||
        !groupRef.current ||
        !cameraRef.current ||
        !bodyDataRef.current
      ) {
        return;
      }

      const ndc = new THREE.Vector2((touchX / width) * 2 - 1, -(touchY / height) * 2 + 1);
      raycasterRef.current.setFromCamera(ndc, cameraRef.current);
      const intersections = raycasterRef.current.intersectObject(groupRef.current, true);
      const hit = intersections[0];
      if (!hit) return;

      const regionId = (hit.object.userData.regionId as string | null | undefined) ?? null;
      if (regionId) onRegionPress?.(regionId);
    },
    [height, onRegionPress, width]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
        Math.abs(gestureState.dx) > HORIZONTAL_DRAG_THRESHOLD,
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
        Math.abs(gestureState.dx) > HORIZONTAL_DRAG_THRESHOLD,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        isDraggingRef.current = true;
        touchMovedRef.current = true;
        spinStateRef.current = null; // user grabbed it — celebration yields
        velocityRef.current = 0;
        lastTouchXRef.current = evt.nativeEvent.locationX;
        lastTimestampRef.current = Date.now();
      },
      onPanResponderMove: (evt) => {
        const now = Date.now();
        const dx = evt.nativeEvent.locationX - lastTouchXRef.current;
        const dt = Math.max(1, now - lastTimestampRef.current);
        if (!Number.isFinite(dx) || !Number.isFinite(dt)) return;
        const delta = dx * DRAG_SENSITIVITY;
        rotationRef.current = normalizeRotation(rotationRef.current + delta);
        velocityRef.current = Number.isFinite(delta / dt) ? (delta / dt) * 16 : 0;
        lastTouchXRef.current = evt.nativeEvent.locationX;
        lastTimestampRef.current = now;
        if (groupRef.current) {
          groupRef.current.rotation.y = rotationRef.current;
        }
        needsRenderRef.current = true;
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        velocityRef.current = Number.isFinite(velocityRef.current)
          ? Math.max(-MAX_RELEASE_VELOCITY, Math.min(MAX_RELEASE_VELOCITY, velocityRef.current))
          : 0;
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        velocityRef.current = 0;
      },
    })
  ).current;

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      try {
        const renderer = createRenderer(gl);
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.setClearColor(BODY_3D_CONFIG.render.clearColorHex, 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          BODY_3D_CONFIG.camera.fov,
          gl.drawingBufferWidth / gl.drawingBufferHeight,
          BODY_3D_CONFIG.camera.near,
          BODY_3D_CONFIG.camera.far
        );
        camera.position.set(
          BODY_3D_CONFIG.camera.position[0],
          BODY_3D_CONFIG.camera.position[1],
          BODY_3D_CONFIG.camera.position[2]
        );
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        scene.add(new THREE.AmbientLight(0xffffff, BODY_3D_CONFIG.lighting.ambientIntensity));
        for (const lightConfig of BODY_3D_CONFIG.lighting.directional) {
          const light = new THREE.DirectionalLight(0xffffff, lightConfig.intensity);
          light.position.set(
            lightConfig.position[0],
            lightConfig.position[1],
            lightConfig.position[2]
          );
          scene.add(light);
        }

        const rawParts = await loadBodyParts();
        if (!aliveRef.current) return;
        const parts = transformBodyParts(rawParts);
        const bodyData = buildSegmentedBody(parts, stimulusRef.current);
        bodyDataRef.current = bodyData;
        displayedLevelsRef.current = stimulusRef.current;

        const group = bodyData.group;
        group.position.x = BODY_3D_CONFIG.model.offsetX;
        group.position.y = BODY_3D_CONFIG.model.offsetY;
        group.rotation.x = BODY_3D_CONFIG.model.tiltX;
        group.rotation.y = rotationRef.current;
        groupRef.current = group;
        scene.add(group);
        sceneReadyRef.current = true;

        // Spin requested before the model finished loading — start it now.
        if (spinPendingRef.current) {
          spinPendingRef.current = false;
          beginSpinRef.current();
        }

        const animate = () => {
          rafRef.current = requestAnimationFrame(animate);

          let needsRender = needsRenderRef.current;
          needsRenderRef.current = false;

          if (!isDraggingRef.current && Math.abs(velocityRef.current) > MIN_INERTIA_VELOCITY) {
            velocityRef.current *= INERTIA_DECAY;
            rotationRef.current = normalizeRotation(rotationRef.current + velocityRef.current);
            needsRender = true;
          } else if (!Number.isFinite(velocityRef.current)) {
            velocityRef.current = 0;
          }

          // Celebration: one smooth eased revolution ending exactly at front.
          if (spinStateRef.current && !isDraggingRef.current) {
            const { startTime, from, delta } = spinStateRef.current;
            const t = Math.min(1, (Date.now() - startTime) / SPIN_DURATION_MS);
            rotationRef.current = normalizeRotation(from + delta * easeInOutCubic(t));
            if (t >= 1) {
              rotationRef.current = 0;
              spinStateRef.current = null;
            }
            needsRender = true;
          }

          // Color crossfade between stimulus states.
          if (colorTweenRef.current && bodyDataRef.current) {
            const { startTime, from, to } = colorTweenRef.current;
            const t = Math.min(1, (Date.now() - startTime) / COLOR_TWEEN_MS);
            updateSegmentedBodyColorsBlended(bodyDataRef.current, from, to, easeInOutCubic(t));
            if (t >= 1) {
              updateSegmentedBodyColors(bodyDataRef.current, to);
              colorTweenRef.current = null;
            }
            needsRender = true;
          }

          if (isDraggingRef.current) {
            needsRender = true;
          }

          if (!needsRender) return;

          if (groupRef.current) {
            groupRef.current.rotation.y = rotationRef.current;
          }

          renderer.render(scene, camera);
          gl.endFrameEXP();
        };
        animate();
        setIsInitializing(false);
      } catch (err) {
        if (__DEV__) {
          console.warn(
            'BodyHeatmap GL error, falling back:',
            err instanceof Error ? (err.stack ?? err.message) : err
          );
        }
        if (!aliveRef.current) return;
        setIsInitializing(false);
        setGlError(true);
      }
    },
    [INERTIA_DECAY, MIN_INERTIA_VELOCITY, normalizeRotation]
  );

  useEffect(() => {
    if (bodyDataRef.current) {
      // Start (or retarget) a crossfade toward the new levels.
      colorTweenRef.current = {
        startTime: Date.now(),
        from: { ...displayedLevelsRef.current },
        to: { ...stimulusLevels },
      };
      needsRenderRef.current = true;
    }
    displayedLevelsRef.current = stimulusLevels;
  }, [stimulusLevels]);

  // One full turn from wherever the body currently faces, landing at front.
  const beginSpinRef = useRef(() => {});
  beginSpinRef.current = () => {
    const from = rotationRef.current;
    const delta = TWO_PI + ((TWO_PI - from) % TWO_PI);
    velocityRef.current = 0;
    spinStateRef.current = { startTime: Date.now(), from, delta };
    needsRenderRef.current = true;
  };

  // Kick off the celebratory spin when the trigger bumps.
  useEffect(() => {
    if (!spinTrigger || spinTrigger === lastSpinTriggerRef.current) return;
    lastSpinTriggerRef.current = spinTrigger;
    if (sceneReadyRef.current) {
      beginSpinRef.current();
    } else {
      spinPendingRef.current = true;
    }
  }, [spinTrigger]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      groupRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  if (glError) {
    return (
      <View style={[styles.fallback, { width, height }]}>
        <Text style={styles.fallbackText}>3D unavailable</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      {isInitializing && (
        <View style={[styles.initPlaceholder, { width, height }]}>
          <ActivityIndicator size="small" color="#555" />
        </View>
      )}
      <GLView style={{ width, height }} onContextCreate={onContextCreate} pointerEvents="none" />
      <View
        style={styles.touchOverlay}
        onTouchStart={(evt) => {
          touchMovedRef.current = false;
          touchStartRef.current = {
            x: evt.nativeEvent.locationX,
            y: evt.nativeEvent.locationY,
          };
        }}
        onTouchMove={(evt) => {
          const dx = evt.nativeEvent.locationX - touchStartRef.current.x;
          const dy = evt.nativeEvent.locationY - touchStartRef.current.y;
          if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
            touchMovedRef.current = true;
          }
        }}
        onTouchEnd={(evt) => {
          if (isDraggingRef.current || touchMovedRef.current) return;
          pickRegion(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        }}
        {...panResponder.panHandlers}
      />
    </View>
  );
}

export default React.memo(BodyHeatmap);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  touchOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    zIndex: 2,
    elevation: 2,
  },
  fallback: {
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#555',
    fontSize: 11,
  },
  initPlaceholder: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
