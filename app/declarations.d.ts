declare module '*.glb' {
  const content: number;
  export default content;
}

declare module 'expo-file-system/legacy' {
  export * from 'expo-file-system';
}
