import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, PanResponder, Text, Platform, ActivityIndicator } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Asset } from 'expo-asset';
import {
  buildSegmentedBody,
  type BodyPartGeometry,
  type SegmentedBodyData,
  updateSegmentedBodyColors,
} from './buildBodyMeshes';
import { BODY_3D_CONFIG } from './threeConfig';
import { startPerfSpan, traceAsync, traceSync } from '../../dev/perfTrace';

interface InteractiveBodyProps {
  width: number;
  height: number;
  stimulusLevels: Record<string, number>;
  onRegionPress?: (regionId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// ─── Body model cache ───────────────────────────────────────────
// Parsed body-part geometries are cached at module level so subsequent mounts
// (tab switches, date changes) skip the expensive download + parse.
// We cache raw un-transformed meshes and clone per mount so each instance gets
// its own geometry/material lifecycle.

let _cachedRawParts: BodyPartGeometry[] | null = null;
let _cachePromise: Promise<BodyPartGeometry[]> | null = null;

// ─── GLB loader (web + native) ──────────────────────────────────

async function loadBinaryAssetBuffer(moduleId: number): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();

  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    return response.arrayBuffer();
  }

  const { readAsStringAsync } = require('expo-file-system/legacy');
  const base64 = await readAsStringAsync(asset.localUri!, {
    encoding: 'base64',
  });
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
  const arrayBuffer = await loadBinaryAssetBuffer(require('../../../assets/models/segmented_body.glb'));

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
    _cachePromise = loadBodyPartsRaw().then((parts) => {
      _cachedRawParts = parts;
      return parts;
    }).catch((err: unknown) => {
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

function transformBodyParts(parts: BodyPartGeometry[]): { parts: BodyPartGeometry[]; vertexCount: number } {
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

  let vertexCount = 0;
  for (const part of parts) {
    part.geometry.translate(-center.x, -center.y, -center.z);
    part.geometry.scale(scale, scale, scale);
    part.geometry.deleteAttribute('normal');
    part.geometry.computeVertexNormals();
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();

    const positionAttribute = part.geometry.getAttribute('position') as THREE.BufferAttribute;
    positionAttribute.needsUpdate = true;
    vertexCount += positionAttribute.count;
  }

  return { parts, vertexCount };
}

// ─── Component ──────────────────────────────────────────────────

function InteractiveBody({
  width,
  height,
  stimulusLevels,
  onRegionPress,
  onDragStart,
  onDragEnd,
}: InteractiveBodyProps) {
  const [glError, setGlError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const HORIZONTAL_DRAG_THRESHOLD = BODY_3D_CONFIG.interaction.horizontalDragThreshold;
  const TAP_THRESHOLD = BODY_3D_CONFIG.interaction.tapThreshold;
  const DRAG_SENSITIVITY = BODY_3D_CONFIG.interaction.dragSensitivity;
  const INERTIA_DECAY = BODY_3D_CONFIG.interaction.inertiaDecay;
  const MAX_RELEASE_VELOCITY = BODY_3D_CONFIG.interaction.maxReleaseVelocity;
  const MIN_INERTIA_VELOCITY = BODY_3D_CONFIG.interaction.minInertiaVelocity;
  const TWO_PI = Math.PI * 2;

  // Rotation state — start at 0 so the transformed body faces forward
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const isDraggingRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchMovedRef = useRef(false);

  // Three.js refs
  const groupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const bodyDataRef = useRef<SegmentedBodyData | null>(null);
  const rafRef = useRef<number | null>(null);

  // Track latest stimulus levels for color updates
  const stimulusRef = useRef(stimulusLevels);
  stimulusRef.current = stimulusLevels;

  const normalizeRotation = useCallback((value: number) => {
    if (!Number.isFinite(value)) return 0;
    const normalized = value % TWO_PI;
    return normalized < 0 ? normalized + TWO_PI : normalized;
  }, [TWO_PI]);

  const pickRegion = useCallback((touchX: number, touchY: number) => {
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
  }, [height, onRegionPress, width]);

  // ─── Pan responder for drag rotation ────────────────────────
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
        velocityRef.current = 0;
        lastTouchXRef.current = evt.nativeEvent.locationX;
        lastTimestampRef.current = Date.now();
        onDragStart?.();
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
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        velocityRef.current = Number.isFinite(velocityRef.current)
          ? Math.max(-MAX_RELEASE_VELOCITY, Math.min(MAX_RELEASE_VELOCITY, velocityRef.current))
          : 0;
        onDragEnd?.();
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        velocityRef.current = 0;
        onDragEnd?.();
      },
    })
  ).current;

  // ─── GL context creation ────────────────────────────────────
  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      const finishInitSpan = startPerfSpan('mobile:dashboard:3d:init', {
        width,
        height,
        platform: Platform.OS,
      });

      try {
        const renderer = new Renderer({ gl });
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.setClearColor(BODY_3D_CONFIG.render.clearColorHex, 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          BODY_3D_CONFIG.camera.fov,
          gl.drawingBufferWidth / gl.drawingBufferHeight,
          BODY_3D_CONFIG.camera.near,
          BODY_3D_CONFIG.camera.far,
        );
        camera.position.set(
          BODY_3D_CONFIG.camera.position[0],
          BODY_3D_CONFIG.camera.position[1],
          BODY_3D_CONFIG.camera.position[2],
        );
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        scene.add(new THREE.AmbientLight(0xffffff, BODY_3D_CONFIG.lighting.ambientIntensity));
        for (const lightConfig of BODY_3D_CONFIG.lighting.directional) {
          const light = new THREE.DirectionalLight(0xffffff, lightConfig.intensity);
          light.position.set(
            lightConfig.position[0],
            lightConfig.position[1],
            lightConfig.position[2],
          );
          scene.add(light);
        }

        const modelCacheHit = _cachedRawParts !== null;
        const rawParts = await traceAsync('mobile:dashboard:3d:load-body-model', () => loadBodyParts(), {
          platform: Platform.OS,
          cacheHit: modelCacheHit,
          format: 'glb',
          segmented: true,
        });

        const { parts, vertexCount } = traceSync('mobile:dashboard:3d:transform-geometry', () => {
          return transformBodyParts(rawParts);
        });

        const bodyData = traceSync(
          'mobile:dashboard:3d:apply-colors',
          () => buildSegmentedBody(parts, stimulusRef.current),
          {
            meshes: parts.length,
          },
        );
        bodyDataRef.current = bodyData;

        const group = bodyData.group;
        group.rotation.x = BODY_3D_CONFIG.model.tiltX;
        group.rotation.y = rotationRef.current;
        groupRef.current = group;
        scene.add(group);

        // Animation loop
        const animate = () => {
          rafRef.current = requestAnimationFrame(animate);

          // Apply inertia when not dragging
          if (!isDraggingRef.current && Math.abs(velocityRef.current) > MIN_INERTIA_VELOCITY) {
            velocityRef.current *= INERTIA_DECAY;
            rotationRef.current = normalizeRotation(rotationRef.current + velocityRef.current);
          } else if (!Number.isFinite(velocityRef.current)) {
            velocityRef.current = 0;
          }

          // Always sync rotation from ref (covers both drag + inertia)
          if (groupRef.current) {
            groupRef.current.rotation.x = BODY_3D_CONFIG.model.tiltX;
            groupRef.current.rotation.y = rotationRef.current;
          }

          renderer.render(scene, camera);
          gl.endFrameEXP();
        };
        animate();
        setIsInitializing(false);

        finishInitSpan({
          vertices: vertexCount,
          meshes: parts.length,
          modelCacheHit,
          format: 'glb',
          segmented: true,
        });
      } catch (err) {
        console.warn('InteractiveBody GL error, falling back:', err);
        setIsInitializing(false);
        setGlError(true);
        finishInitSpan({ failed: true });
      }
    },
    [INERTIA_DECAY, MIN_INERTIA_VELOCITY, height, normalizeRotation, width]
  );

  // ─── Update colors when stimulus changes ────────────────────
  useEffect(() => {
    if (bodyDataRef.current) {
      updateSegmentedBodyColors(bodyDataRef.current, stimulusLevels);
    }
  }, [stimulusLevels]);

  // ─── Cleanup RAF on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      groupRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // ─── Fallback on GL error ───────────────────────────────────
  if (glError) {
    return (
      <View style={[styles.fallback, { width, height }]}>
        <Text style={styles.fallbackText}>3D unavailable</Text>
      </View>
    );
  }

  return (
      <View
        style={[styles.container, { width, height }]}
    >
      {isInitializing && (
        <View style={[styles.initPlaceholder, { width, height }]}>
          <ActivityIndicator size="small" color="#333" />
          <Text style={styles.initText}>Loading model…</Text>
        </View>
      )}
      <GLView
        style={{ width, height }}
        onContextCreate={onContextCreate}
        pointerEvents="none"
      />
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

export default React.memo(InteractiveBody);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  touchOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    elevation: 2,
  },
  fallback: {
    backgroundColor: '#141414',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#555',
    fontSize: 11,
  },
  initPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#141414',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  initText: {
    color: '#444',
    fontSize: 11,
    marginTop: 8,
  },
});
