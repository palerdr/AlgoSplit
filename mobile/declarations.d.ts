declare module '*.stl' {
  const content: number;
  export default content;
}

declare module 'three/examples/jsm/loaders/STLLoader' {
  import { BufferGeometry, Loader } from 'three';
  export class STLLoader extends Loader {
    parse(data: ArrayBuffer | string): BufferGeometry;
  }
}

declare module 'expo-file-system/legacy' {
  export function readAsStringAsync(
    fileUri: string,
    options?: { encoding?: string }
  ): Promise<string>;
}
