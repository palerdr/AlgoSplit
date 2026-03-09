declare module '*.stl' {
  const content: number;
  export default content;
}

declare module 'three/examples/jsm/loaders/STLLoader' {
  import { BufferGeometry, Loader, LoadingManager } from 'three';
  export class STLLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(data: ArrayBuffer | string): BufferGeometry;
  }
}

declare module 'expo-file-system/legacy' {
  export * from 'expo-file-system';
}

// Use CJS middleware entry on web to avoid `import.meta` parsing issues
// while keeping the standard Zustand middleware typings.
declare module 'zustand/middleware.js' {
  export * from 'zustand/middleware';
}
