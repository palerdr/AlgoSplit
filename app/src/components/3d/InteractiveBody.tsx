import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, PanResponder, Text, Platform } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { Asset } from 'expo-asset';
import { applyBodyColors, updateBodyColors, type ColoredBodyData } from './buildBodyMeshes';

interface InteractiveBodyProps {
  width: number;
  height: number;
  stimulusLevels: Record<string, number>;
  onRegionPress?: (regionId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// ─── STL loader (web + native) ──────────────────────────────────

async function loadSTLGeometry(): Promise<THREE.BufferGeometry> {
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
  let geometry = loader.parse(arrayBuffer);
  geometry.center();

  return geometry;
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
  const HORIZONTAL_DRAG_THRESHOLD = 5;
  const TAP_THRESHOLD = 6;
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
        const delta = dx * 0.006;
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
        velocityRef.current = Number.isFinite(velocityRef.current) ? Math.max(-0.2, Math.min(0.2, velocityRef.current)) : 0;
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
      try {
        const renderer = new Renderer({ gl });
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.setClearColor(0x0d0d0d, 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          35,
          gl.drawingBufferWidth / gl.drawingBufferHeight,
          0.1,
          100
        );
        camera.position.set(0, 0, 5);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Lighting — flat shading needs higher ambient (no smooth gradient)
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const main = new THREE.DirectionalLight(0xffffff, 1.2);
        main.position.set(3, 4, 5);
        scene.add(main);
        const fill = new THREE.DirectionalLight(0xffffff, 0.7);
        fill.position.set(-4, 1, 3);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffff, 0.6);
        rim.position.set(-2, 3, -2);
        scene.add(rim);
        const bottom = new THREE.DirectionalLight(0xffffff, 0.3);
        bottom.position.set(0, -3, 2);
        scene.add(bottom);
        const back = new THREE.DirectionalLight(0xffffff, 0.35);
        back.position.set(1, 0, -4);
        scene.add(back);

        // Load STL body model
        const geometry = await loadSTLGeometry();

        // Scale to fit ~2.8 units in largest dimension
        const bbox = new THREE.Box3().setFromBufferAttribute(
          geometry.getAttribute('position') as THREE.BufferAttribute
        );
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const scale = 2.8 / Math.max(size.x, size.y, size.z);

        // Transform vertices: Z-up STL → Y-up world + apply scale
        const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          const ox = posAttr.getX(i);
          const oy = posAttr.getY(i);
          const oz = posAttr.getZ(i);
          // STL Z-up → Y-up: (x, y, z) → (x, z, -y)
          posAttr.setXYZ(i, ox * scale, oz * scale, -oy * scale);
        }
        posAttr.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        // Apply per-face region coloring (centroid-based)
        const bodyData = applyBodyColors(geometry, stimulusRef.current);
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
          if (!isDraggingRef.current && Math.abs(velocityRef.current) > 0.0001) {
            velocityRef.current *= 0.95;
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
      } catch (err) {
        console.warn('InteractiveBody GL error, falling back:', err);
        setGlError(true);
      }
    },
    []
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
});
