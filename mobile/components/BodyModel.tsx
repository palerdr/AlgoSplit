import { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';

interface BodyModelProps {
  width: number;
  height: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function BodyModel({ width, height, onDragStart, onDragEnd }: BodyModelProps) {
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Capture touch so parent ScrollView can't steal it
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false, // don't let go of the responder
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
        velocityRef.current = delta / dt * 16;

        lastTouchXRef.current = evt.nativeEvent.pageX;
        lastTimestampRef.current = now;

        if (modelRef.current) {
          modelRef.current.rotation.y = rotationRef.current;
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

  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x0D0D0D, 1);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      35,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    // Strong lighting — make model appear bright white
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(3, 4, 5);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-4, 1, 3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(-2, 3, -1);
    scene.add(rimLight);

    const bottomLight = new THREE.DirectionalLight(0xffffff, 0.5);
    bottomLight.position.set(0, -3, 2);
    scene.add(bottomLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
    backLight.position.set(1, 0, -4);
    scene.add(backLight);

    try {
      const asset = Asset.fromModule(require('../assets/models/body.stl'));
      await asset.downloadAsync();

      if (asset.localUri) {
        const fileContent = await readAsStringAsync(asset.localUri, {
          encoding: 'base64',
        });

        const binaryString = atob(fileContent);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const loader = new STLLoader();
        const geometry = loader.parse(bytes.buffer);
        geometry.computeVertexNormals();
        geometry.center();

        const bbox = new THREE.Box3().setFromBufferAttribute(
          geometry.attributes.position as THREE.BufferAttribute
        );
        const bboxSize = new THREE.Vector3();
        bbox.getSize(bboxSize);
        const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
        const scaleFactor = 2.8 / maxDim;

        const material = new THREE.MeshPhongMaterial({
          color: 0xe0e0e0,
          specular: 0x555555,
          shininess: 20,
          flatShading: true,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        mesh.rotation.x = -Math.PI / 2;

        const pivot = new THREE.Group();
        pivot.add(mesh);
        modelRef.current = pivot;
        scene.add(pivot);
      }
    } catch (error) {
      console.log('STL load error, using fallback:', error);
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshPhongMaterial({ color: 0xe0e0e0, flatShading: true });

      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), bodyMat);
      head.position.y = 1.1;
      group.add(head);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.25, 1, 1, 1), bodyMat);
      torso.position.y = 0.5;
      group.add(torso);
      const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
      const la = new THREE.Mesh(armGeo, bodyMat); la.position.set(-0.36, 0.5, 0); group.add(la);
      const ra = new THREE.Mesh(armGeo, bodyMat); ra.position.set(0.36, 0.5, 0); group.add(ra);
      const legGeo = new THREE.BoxGeometry(0.15, 0.7, 0.15);
      const ll = new THREE.Mesh(legGeo, bodyMat); ll.position.set(-0.13, -0.2, 0); group.add(ll);
      const rl = new THREE.Mesh(legGeo, bodyMat); rl.position.set(0.13, -0.2, 0); group.add(rl);
      group.position.y = -0.3;
      modelRef.current = group;
      scene.add(group);
    }

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      if (!isDraggingRef.current && Math.abs(velocityRef.current) > 0.0001) {
        velocityRef.current *= 0.95;
        rotationRef.current += velocityRef.current;
        if (modelRef.current) {
          modelRef.current.rotation.y = rotationRef.current;
        }
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <View
      style={[styles.container, { width, height }]}
      {...panResponder.panHandlers}
    >
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  glView: {
    flex: 1,
  },
});
