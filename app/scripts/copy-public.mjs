import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');

await mkdir(output, { recursive: true });
await copyFile(resolve(root, 'public', 'privacy.html'), resolve(output, 'privacy.html'));
