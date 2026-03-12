import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, PanResponder, Text, Platform, ActivityIndicator } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { Asset } from 'expo-asset';
import { applyBodyColors, updateBodyColors, type ColoredBodyData } from './buildBodyMeshes';
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

// ─── STL geometry cache ─────────────────────────────────────────
// Parsed BufferGeometry is cached at module level so subsequent mounts
// (tab switches, date changes) skip the expensive download + parse.
// We cache the raw (un-transformed) geometry and clone per mount so
// each instance gets its own position attribute to transform.

let _cachedRawGeometry: THREE.BufferGeometry | null = null;
let _cachePromise: Promise<THREE.BufferGeometry> | null = null;

// ─── STL loader (web + native) ──────────────────────────────────

async function loadSTLGeometryRaw(): Promise<THREE.BufferGeometry> {
  const asset = Asset.fromModule(require('../../../assets/models/body.stl'));
  await asset.downloadAsync();

  let arrayBuffer: ArrayBuffer;

  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    arrayBuffer = await response.arrayBuffer();
  } else {
    const { readAsStringAsync } = require('expo-file-system/legacy');
    const base64 = await readAsStringAsync(asset.localUri!, {
      encoding: 'base64',
    });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    arrayBuffer = bytes.buffer;
  }

  const loader = new STLLoader();
  const geometry = loader.parse(arrayBuffer);
  geometry.center();

  return geometry;
}

async function loadSTLGeometry(): Promise<THREE.BufferGeometry> {
  if (_cachedRawGeometry) {
    return _cachedRawGeometry.clone();
  }

  if (!_cachePromise) {
    _cachePromise = loadSTLGeometryRaw().then((geo) => {
      _cachedRawGeometry = geo;
      return geo;
    }).catch((err: unknown) => {
      _cachePromise = null;
      throw err;
    }) as Promise<THREE.BufferGeometry>;
  }

  const raw = await _cachePromise;
  // First caller gets a clone too — the cached original stays untouched
  return raw.clone();
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

  // Rotation state — start at 0 so the transformed STL faces forward
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const isDraggingRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchMovedRef = useRef(false);

  // Three.js refs
  const groupRef = useRef<THREE.Group | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const bodyDataRef = useRef<ColoredBodyData | null>(null);
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
      !meshRef.current ||
      !cameraRef.current ||
      !bodyDataRef.current
    ) {
      return;
    }

    const ndc = new THREE.Vector2((touchX / width) * 2 - 1, -(touchY / height) * 2 + 1);
    raycasterRef.current.setFromCamera(ndc, cameraRef.current);
    const intersections = raycasterRef.current.intersectObject(meshRef.current, false);
    const hit = intersections[0];
    if (!hit || hit.faceIndex === undefined) return;

    const regionId = bodyDataRef.current.faceRegions[hit.faceIndex];
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

        const stlCacheHit = _cachedRawGeometry !== null;
        const geometry = await traceAsync('mobile:dashboard:3d:load-stl', () => loadSTLGeometry(), {
          platform: Platform.OS,
          cacheHit: stlCacheHit,
        });

        const posAttr = traceSync('mobile:dashboard:3d:transform-geometry', () => {
          const bbox = new THREE.Box3().setFromBufferAttribute(
            geometry.getAttribute('position') as THREE.BufferAttribute,
          );
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const scale = BODY_3D_CONFIG.model.maxDimension / Math.max(size.x, size.y, size.z);

          const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < positionAttribute.count; i++) {
            const ox = positionAttribute.getX(i);
            const oy = positionAttribute.getY(i);
            const oz = positionAttribute.getZ(i);
            positionAttribute.setXYZ(i, ox * scale, oz * scale, -oy * scale);
          }
          positionAttribute.needsUpdate = true;
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();

          return positionAttribute;
        });

        const bodyData = traceSync(
          'mobile:dashboard:3d:apply-colors',
          () => applyBodyColors(geometry, stimulusRef.current),
          {
            faces: posAttr.count / 3,
          },
        );
        bodyDataRef.current = bodyData;

        const material = new THREE.MeshPhongMaterial({
          vertexColors: true,
          flatShading: true,
          shininess: 4,
          specular: new THREE.Color(0x111111),
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        meshRef.current = mesh;
        const group = new THREE.Group();
        group.add(mesh);
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
            groupRef.current.rotation.y = rotationRef.current;
          }

          renderer.render(scene, camera);
          gl.endFrameEXP();
        };
        animate();
        setIsInitializing(false);

        finishInitSpan({
          vertices: posAttr.count,
          faces: posAttr.count / 3,
          stlCacheHit,
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
      updateBodyColors(bodyDataRef.current, stimulusLevels);
    }
  }, [stimulusLevels]);

  // ─── Cleanup RAF on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      meshRef.current = null;
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
