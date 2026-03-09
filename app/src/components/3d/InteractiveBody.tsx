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
  onDragStart,
  onDragEnd,
}: InteractiveBodyProps) {
  const [glError, setGlError] = useState(false);

  // Rotation state — start at PI so the front faces the camera
  const rotationRef = useRef(Math.PI);
  const velocityRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Three.js refs
  const groupRef = useRef<THREE.Group | null>(null);
  const bodyDataRef = useRef<ColoredBodyData | null>(null);
  const rafRef = useRef<number | null>(null);

  // Track latest stimulus levels for color updates
  const stimulusRef = useRef(stimulusLevels);
  stimulusRef.current = stimulusLevels;

  // ─── Pan responder for drag rotation ────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        isDraggingRef.current = true;
        velocityRef.current = 0;
        lastTouchXRef.current = evt.nativeEvent.pageX;
        lastTimestampRef.current = Date.now();
        onDragStart?.();
      },
      onPanResponderMove: (evt) => {
        const now = Date.now();
        const dx = evt.nativeEvent.pageX - lastTouchXRef.current;
        const dt = Math.max(1, now - lastTimestampRef.current);
        const delta = dx * 0.006;
        rotationRef.current += delta;
        velocityRef.current = (delta / dt) * 16;
        lastTouchXRef.current = evt.nativeEvent.pageX;
        lastTimestampRef.current = now;
        if (groupRef.current) {
          groupRef.current.rotation.y = rotationRef.current;
        }
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        onDragEnd?.();
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
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

        // Apply per-face region coloring (centroid-based)
        const bodyData = applyBodyColors(geometry, stimulusRef.current);
        bodyDataRef.current = bodyData;

        const material = new THREE.MeshPhongMaterial({
          vertexColors: true,
          flatShading: true,
          shininess: 15,
          specular: new THREE.Color(0x333333),
        });

        const mesh = new THREE.Mesh(geometry, material);
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
            rotationRef.current += velocityRef.current;
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
    <View style={[styles.container, { width, height }]} {...panResponder.panHandlers}>
      <GLView style={{ width, height }} onContextCreate={onContextCreate} />
    </View>
  );
}

export default React.memo(InteractiveBody);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
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
